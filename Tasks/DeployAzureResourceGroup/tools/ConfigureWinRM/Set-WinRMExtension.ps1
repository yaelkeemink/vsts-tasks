#################################################################################################################################
#  Name        : Set-WinRMExtension.ps1                                                                                         #
#                                                                                                                               #
#  Description : Add the WinRM VM Extension to the remote Azure VM which configures the WinRM on the Azure machine              #
#                                                                                                                               #
#  Usage       : Set-WinRMExtension -resourceGroupName <rganme> -vmName <vmname> -dnsName <dnsName> -securityGroupName <sgName> #
#################################################################################################################################

param
(
    [Parameter(Mandatory=$true, HelpMessage="Enter Azure Resource Group name")]
    [string] $resourceGroupName,

    [Parameter(Mandatory=$true, HelpMessage="Enter the VMName on which WinRM need to be configured")]
    [string] $vmName,

    [Parameter(Mandatory=$true, HelpMessage="Provide the FQDN of the VM. Like, testvm.westus.cloupdapp.azure.com or *.westus.cloupdapp.azure.com")]
    [string] $dnsName,

    [Parameter(Mandatory=$true, HelpMessage="Name of Security group to which inbound config rule needs to be added")]
    [string] $securityGroupName,

    [Parameter(Mandatory=$true, HelpMessage="Provide the priority of inbound rule configuration for winrm")]
    [string] $inboundRulePriotity
)

#################################################################################################################################
#                                             Helper Functions                                                                  #
#################################################################################################################################

function Import-AzureRMModule
{
    #Initialize subscription
    $isAzureModulePresent = Get-Module -Name AzureRM -ListAvailable

    if ([String]::IsNullOrEmpty($isAzureModulePresent) -eq $true)
    {
        Write-Output "Script requires AzureRM module to be present. Obtain AzureRM from https://www.powershellgallery.com/packages/AzureRM/" -Verbose
        return
    }

    Import-Module -Name AzureRM
}

function Add-AzureVMExtension
{
    # Fecth the VM details
    $vm = Get-AzureRMVM -ResourceGroupName $resourceGroupName -Name $vmName
    
    try
    {
        Write-Verbose -Verbose "Trying to remove an exisitng winrm configuration script extension, if any."

        $customScriptExtension = Get-AzureRmVMCustomScriptExtension -ResourceGroupName $resourceGroupName -VMName $vmName -Name "WinRmScript" -ErrorAction SilentlyContinue
        if($customScriptExtension)
        {
            Remove-AzureRmVMCustomScriptExtension -ResourceGroupName $resourceGroupName -VMName $vmName -Name "WinRmScript" -Force
        }
    }
    catch
    {
        #Ignoring the exception
    }

    Write-Verbose -Verbose "Setting the winrm configure script extension."
    $result = Set-AzureRmVMCustomScriptExtension -ResourceGroupName $resourceGroupName -VMName $vmName -Name "WinRmScript" -FileUri "https://azurergtaskstorage.blob.core.windows.net/winrm/ConfigureWinRM.ps1" -Run "ConfigureWinRM.ps1" -Argument $dnsName -Location "West US"

    if($result.Status -ne "Succeeded")
    {
        $result.Error | fl
        throw "Failed to set the extension"
    }
    else
    {
        Write-Verbose -Verbose "Set the extension successfully."
    }
}

function Validate-ScriptExecutionStatus
{
    Write-Verbose "Validating the script execution status"

    $isScriptExecutionPassed = $true
    $status= Get-AzureRMVM -ResourceGroupName $resourceGroupName -Name $vmName -Status
    $customScriptExtension = $status.Extensions | Where-Object { $_.ExtensionType -eq "Microsoft.Compute.CustomScriptExtension" }

    if($customScriptExtension)
    {
        $subStatues = $customScriptExtension.SubStatuses
        if($subStatues)
        {
            foreach($subStatus in $subStatues)
            {
                if($subStatus.Code.Contains("ComponentStatus/StdErr") -and (-not [string]::IsNullOrEmpty($subStatus.Message)))
                {
                    $isScriptExecutionPassed = $false
                }
            }
        }
        else
        {
            $isScriptExecutionPassed = $false
        }
    }
    else
    {
        throw "No custom script extension exisits"
    }

    if(-not $isScriptExecutionPassed)
    {
        $customScriptExtension.SubStatuses | fl

        throw "Failed to execute the WinRM configuration script"
    }
}

function Add-NetworkSecurityRuleConfig
{
    param(
        [string] $ruleName,
        [string] $winrmHttpsPort
    )

    Write-Verbose "Adding the inboudrule for winrmhttps"

    $securityGroup = Get-AzureRmNetworkSecurityGroup -Name $securityGroupName -ResourceGroupName $resourceGroupName
    if(-not $securityGroup)
    {
        throw "No Network security group exisits with the name $securityGroupName under resource group $resourceGroupName"
    }

    try
    {
        $winrrmConfigRule = Get-AzureRmNetworkSecurityRuleConfig -NetworkSecurityGroup $securityGroup -Name $ruleName -EA SilentlyContinue        
    }
    catch
    {
        #Suppresing the exception message to console
    }

    if(-not $winrrmConfigRule)
    {        
        Add-AzureRmNetworkSecurityRuleConfig -NetworkSecurityGroup $securityGroup -Name $ruleName -Direction Inbound -Access Allow -SourceAddressPrefix '*' -SourcePortRange '*' -DestinationAddressPrefix '*' -DestinationPortRange $winrmHttpsPort -Protocol * -Priority $inboundRulePriotity | Set-AzureRmNetworkSecurityGroup
    }
}

#################################################################################################################################
#                                              Set WinRM VM Extension                                                           #
#################################################################################################################################

# Initialize
$ErrorActionPreference = "Stop"
$VerbosePreference = "SilentlyContinue"
$ruleName = "default-allow-winrmhttps"
$winrmHttpsPort="5986"

# Load the AzureRm module
Import-AzureRMModule

# Set the extension
Add-AzureVMExtension

# Validate the extension
Validate-ScriptExecutionStatus

# Add the Inbound rule
Add-NetworkSecurityRuleConfig -ruleName $ruleName -winrmHttpsPort $winrmHttpsPort

#################################################################################################################################
#################################################################################################################################
