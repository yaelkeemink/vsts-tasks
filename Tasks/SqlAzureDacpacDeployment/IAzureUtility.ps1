[CmdletBinding(DefaultParameterSetName = 'None')]
param
(
    [String] [Parameter(Mandatory = $true)] $ConnectedServiceName,
    [String] [Parameter(Mandatory = $true)] $DacpacFile,
    [String] [Parameter(Mandatory = $true)] $ServerName,
    [String] [Parameter(Mandatory = $true)] $DatabaseName,
    [String] $SqlUsername,
    [String] $SqlPassword,
    [String] $PublishProfile,
    [String] $AdditionalArguments,
    [String] [Parameter(Mandatory = $true)] $IpDetectionMethod,
    [String] $StartIpAddress,
    [String] $EndIpAddress,
    [String] [Parameter(Mandatory = $true)] $DeleteFirewallRule
)

Write-Verbose "Entering script DeploySqlAzure.ps1"

# Log arguments
Write-Verbose "DacpacFile= $DacpacFile" -Verbose
Write-Verbose "ServerName= $ServerName" -Verbose
Write-Verbose "DatabaseName= $DatabaseName" -Verbose
Write-Verbose "SqlUsername= $SqlUsername" -Verbose
Write-Verbose "PublishProfile= $PublishProfile" -Verbose
Write-Verbose "AdditionalArguments= $AdditionalArguments" -Verbose
Write-Verbose "StartIPAddress= $StartIPAddress" -Verbose
Write-Verbose "EndIPAddress= $EndIPAddress" -Verbose
Write-Verbose "DeleteFirewallRule= $DeleteFirewallRule" -Verbose

# Import all the dlls and modules which have cmdlets we need
Import-Module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
Import-Module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
Import-Module "Microsoft.TeamFoundation.DistributedTask.Task.DevTestLabs"

# Load all dependent files for execution
Import-Module ./Utility.ps1 -Force

$ErrorActionPreference = 'Stop'

$serverFriendlyName = $ServerName.split(".")[0]
Write-Verbose "Server friendly name is $serverFriendlyName" -Verbose

# Getting start and end IP address for agent machine
$ipAddress = Get-AgentIPAddress -StartIPAddress $StartIpAddress -EndIPAddress $EndIpAddress -IPDetectionMethod $IpDetectionMethod -TaskContext $distributedTaskContext

$startIp =$ipAddress.StartIPAddress
$endIp = $ipAddress.EndIPAddress

Try
{
    # creating firewall rule for agent on sql server
    $firewallSettings = Create-AzureSqlDatabaseServerFirewallRule -StartIP $startIp -EndIP $endIp -ServerName $serverFriendlyName
    $firewallRuleName = $firewallSettings.RuleName
    $isFirewallConfigured = $firewallSettings.IsConfigured

    # getting script arguments to execute sqlpackage.exe
    Write-Verbose "Creating SQLPackage.exe agruments" -Verbose
    $scriptArgument = Get-SqlPackageCommandArguments -dacpacFile $DacpacFile -targetMethod "server" -serverName $ServerName -databaseName $DatabaseName `
                                                     -sqlUsername $SqlUsername -sqlPassword $SqlPassword -publishProfile $PublishProfile -additionalArguments $AdditionalArguments
    Write-Verbose "Created SQLPackage.exe agruments" -Verbose

    $sqlDeploymentScriptPath = Join-Path "$env:AGENT_HOMEDIRECTORY" "Agent\Worker\Modules\Microsoft.TeamFoundation.DistributedTask.Task.DevTestLabs\Scripts\Microsoft.TeamFoundation.DistributedTask.Task.Deployment.Sql.ps1"
    $SqlPackageCommand = "& `"$sqlDeploymentScriptPath`" $scriptArgument"

    Write-Verbose "Executing SQLPackage.exe"  -Verbose

    $ErrorActionPreference = 'Continue'
    Invoke-Expression -Command $SqlPackageCommand
    $ErrorActionPreference = 'Stop'
}
Finally
{
    # deleting firewall rule for agent on sql server
    Delete-AzureSqlDatabaseServerFirewallRule -ServerName $serverFriendlyName -FirewallRuleName $firewallRuleName -IsFirewallConfigured $isFirewallConfigured -DeleteFireWallRule $DeleteFirewallRule
}

Write-Verbose "Leaving script DeploySqlAzure.ps1"  -Verbose