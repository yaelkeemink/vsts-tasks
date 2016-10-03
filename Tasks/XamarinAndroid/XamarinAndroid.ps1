[CmdletBinding()]
param()

Trace-VstsEnteringInvocation $MyInvocation
try {
    Import-VstsLocStrings "$PSScriptRoot\Task.json"

    # Get the inputs.
    <# copied from msbuild.ps1
    # [string]$msBuildLocationMethod = Get-VstsInput -Name MSBuildLocationMethod
    # [string]$msBuildLocation = Get-VstsInput -Name MSBuildLocation
    # [string]$msBuildArguments = Get-VstsInput -Name MSBuildArguments
    # [string]$solution = Get-VstsInput -Name Solution -Require
    # [string]$platform = Get-VstsInput -Name Platform
    # [string]$configuration = Get-VstsInput -Name Configuration
    # [bool]$clean = Get-VstsInput -Name Clean -AsBool
    # [bool]$maximumCpuCount = Get-VstsInput -Name MaximumCpuCount -AsBool
    # [bool]$restoreNuGetPackages = Get-VstsInput -Name RestoreNuGetPackages -AsBool
    # [bool]$logProjectEvents = Get-VstsInput -Name LogProjectEvents -AsBool
    # [bool]$createLogFile = Get-VstsInput -Name CreateLogFile -AsBool
    # [string]$msBuildVersion = Get-VstsInput -Name MSBuildVersion
    # [string]$msBuildArchitecture = Get-VstsInput -Name MSBuildArchitecture
    #>
    ###### copied from XamarinAndroid.ps1 - need to port to ps3 functions
    param(
        [string]$project, 
        [string]$target, 
        [string]$configuration,
        [string]$clean,
        [string]$outputDir,
        [string]$msbuildLocation, 
        [string]$msbuildArguments,
        [string]$jdkVersion,
        [string]$jdkArchitecture
    )

    Write-Verbose "Entering script XamarinAndroid.ps1"
    Write-Verbose "project = $project"
    Write-Verbose "target = $target"
    Write-Verbose "configuration = $configuration"
    Write-Verbose "clean = $clean"
    Write-Verbose "outputDir = $outputDir"
    Write-Verbose "msbuildLocation = $msbuildLocation"
    Write-Verbose "msbuildArguments = $msbuildArguments"
    Write-Verbose "jdkVersion = $jdkVersion"
    Write-Verbose "jdkArchitecture = $jdkArchitecture"
    if (!$project)
    {
        throw "project parameter not set on script"
    }

    # Import the helpers.
    # . $PSScriptRoot\Select-MSBuildLocation.ps1
    Import-Module -Name $PSScriptRoot\ps_modules\MSBuildHelpers\MSBuildHelpers.psm1

    # Resolve match patterns.
    $solutionFiles = Get-SolutionFiles -Solution $solution
    <# from old impl
    # # check for project pattern
    # if ($project.Contains("*") -or $project.Contains("?"))
    # {
    #     Write-Verbose "Pattern found in solution parameter. Calling Find-Files."
    #     Write-Verbose "Find-Files -SearchPattern $project"
    #     $projectFiles = Find-Files -SearchPattern $project
    #     Write-Verbose "projectFiles = $projectFiles"
    # }
    # else
    # {
    #     Write-Verbose "No Pattern found in project parameter."
    #     $projectFiles = ,$project
    # }

    # if (!$projectFiles)
    # {
    #     throw "No project with search pattern '$project' was found."
    # }
    #>

    # Format the MSBuild args.
    <# COPIED FROM MSBUILD.PS1:
        $msBuildArguments = Format-MSBuildArguments -MSBuildArguments $msBuildArguments -Platform $platform -Configuration $configuration -MaximumCpuCount:$maximumCpuCount
    # COPIED FROM XamarinAndroid.PS1:
        $args = $msbuildArguments;

        if ($configuration)
        {
            Write-Verbose "adding configuration: $configuration"
            $args = "$args /p:configuration=$configuration"
        }

        if ($clean.ToLower() -eq 'true')
        {
            Write-Verbose "adding /t:clean"
            $args = "$args /t:clean"
        }

        if ($target)
        {
            Write-Verbose "adding target: $target"
            $args = "$args /t:$target"
        }

        # Always build the APK file
        Write-Verbose "adding target: PackageForAndroid"
        $args = "$args /t:PackageForAndroid"

        if ($outputDir) 
        {
            Write-Verbose "adding OutputPath: $outputDir"
            $args = "$args /p:OutputPath=""$outputDir"""
        }
    #>

    # # # Resolve the MSBuild location.
    # # $msBuildLocation = Select-MSBuildLocation -Method $msBuildLocationMethod -Location $msBuildLocation -Version $msBuildVersion -Architecture $msBuildArchitecture
    # see D:\vsts-tasks\Tasks\MSBuild\Select-MSBuildLocation.ps1 as a go-by
    # and that calls into D:\vsts-tasks\Tasks\Common\MSBuildHelpers\PathFunctions.ps1

    <# COPIED FROM XamarinAndroid:
    if ($jdkVersion -and $jdkVersion -ne "default")
    {
        $jdkPath = Get-JavaDevelopmentKitPath -Version $jdkVersion -Arch $jdkArchitecture
        if (!$jdkPath) 
        {
            throw "Could not find JDK $jdkVersion $jdkArchitecture, please make sure the selected JDK is installed properly"
        }

        Write-Verbose "adding JavaSdkDirectory: $jdkPath"
        $args = "$args /p:JavaSdkDirectory=`"$jdkPath`""
    }

    # Copy from vsts-agent: https://github.com/Microsoft/vsts-agent/blob/master/src/Misc/layoutbin/powershell/Add-JavaCapabilities.ps1
    #>


    # Change the error action preference to 'Continue' so that each solution will build even if
    # one fails. Since the error action preference is being changed from 'Stop' (the default for
    # PowerShell3 handler) to 'Continue', errors will no longer be terminating and "Write-VstsSetResult"
    # needs to explicitly be called to fail the task. Invoke-BuildTools handles calling
    # "Write-VstsSetResult" on nuget.exe/msbuild.exe failure.
    $global:ErrorActionPreference = 'Continue'

    # Build each solution.
    <# FROM MSBuild.ps1:
    Invoke-BuildTools -NuGetRestore:$restoreNuGetPackages -SolutionFiles $solutionFiles -MSBuildLocation $msBuildLocation -MSBuildArguments $msBuildArguments -Clean:$clean -NoTimelineLogger:(!$logProjectEvents) -CreateLogFile:$createLogFile

    # FROM XamarinAndroid.ps1:
    # build each project file
    $exitCode = 0;
    foreach ($pf in $projectFiles)
    {
        try {
            Invoke-MSBuild $pf -LogFile "$pf.log" -ToolLocation $msBuildLocation -CommandLineArgs $args
        }
        catch [System.Exception] {
            Write-Error $error[0]
            $exitCode = 1
        }
    }

    if ($exitCode -ne 0) {
        Write-Error "See https://go.microsoft.com/fwlink/?LinkId=760847"
    }

    Write-Verbose "Leaving script XamarinAndroid.ps1"
    #>
} finally {
    Trace-VstsLeavingInvocation $MyInvocation
}
