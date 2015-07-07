function Delete-MachineGroupFromProvider
{
    param([string]$machineGroupName)

    Write-Verbose "Skipping delete operation on machinegroup $machineGroupName for pre-existing machines" -Verbose
}

function Delete-MachineFromProvider
{
    param([string]$machineGroupName,
          [string]$machineName)

    Write-Verbose "Skipping delete operation on machine $machineName on pre-existing machines" -Verbose
    return "Succedded"
}

function Start-MachineInProvider
{
    param([string]$machineGroupName,
          [string]$machineName)

    throw (Get-LocalizedString -Key "Start operation is not supported by the pre-existing machines")
}

function Stop-MachineInProvider
{
    param([string]$machineGroupName,
          [string]$machineName)

    throw (Get-LocalizedString -Key "Stop operation is not supported by the pre-existing machines")
}

function Restart-MachineInProvider
{
    param([string]$machineGroupName,
          [string]$machineName)

    throw (Get-LocalizedString -Key "Restart operation is not supported by the pre-existing machines")
}

function Unblock-MachineGroup
{
    param([string]$machineGroupName)

    Write-Verbose "Invoking unblock operation for machine group $machineGroupName" -Verbose
    Invoke-UnblockEnvironment -EnvironmentName $machineGroupName -Connection $connection
    Write-Verbose "Unblocked machine group $machineGroupName" -Verbose
}

function Block-MachineGroup
{
    param([string]$machineGroupName,
          [string]$blockedFor,
          [string]$timeInHours)

    $time = $timeInHours -as [INT]
    if(($time -eq $null) -or ($time -lt 0))
    {
        Write-Error("Cannot block machine group for $timeInHours hours. Time in hours should be a positive number of hours for which machine group will be blocked")
    }
    
    Write-Verbose "Invoking block operation for machine group $machineGroupName" -Verbose

    try
    {
        Invoke-BlockEnvironment -EnvironmentName $machineGroupName -BlockedFor $blockedFor -TimeInHours $time -Connection $connection
        Write-Verbose "Blocked machine group $machineGroupName" -Verbose 
    }
    catch [System.Exception]
    {
        if ($_.Exception.GetType().FullName -eq "Microsoft.VisualStudio.Services.DevTestLabs.Client.DtlObjectNotFoundException" -and $providerName -eq "AzureResourceGroupManagerV2")
        {
        }
        else
        {
            throw $_
        }
    }
}