param(
    [string]$testMachineGroup,
    [string]$dropLocation,
    [string]$sourcefilters,
    [string]$testFilterCriteria,
    [string]$platform,
    [string]$configuration,
    [string]$runSettingsFile,
    [string]$codeCoverageEnabled,
    [string]$overrideRunParams,
    [string]$testConfigurations,
    [string]$autMachineGroup
)

Write-Verbose "Entering script RunDistributedTests.ps1"
Write-Verbose "TestMachineGroup = $testMachineGroup"
Write-Verbose "Test Drop Location = $dropLocation"
Write-Verbose "Source Filter = $sourcefilters"
Write-Verbose "Test Filter Criteria = $testFilterCriteria"
Write-Verbose "RunSettings File = $runSettingsFile"
Write-Verbose "Build Platform = $platform"
Write-Verbose "Build Configuration = $configuration"
Write-Verbose "CodeCoverage Enabled = $codeCoverageEnabled"
Write-Verbose "TestRun Parameters to override = $overrideRunParams"
Write-Verbose "TestConfiguration = $testConfigurations"
Write-Verbose "Application Under Test Machine Group = $autTestMachineGroup"

# Import the Task.Internal dll that has all the cmdlets we need for Build
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.DTA"

Write-Verbose "Getting the connection object"
$connection = Get-VssConnection -TaskContext $distributedTaskContext

# Get current directory.
$currentDirectory = Convert-Path .
$unregisterTestAgentScriptLocation = Join-Path -Path $currentDirectory -ChildPath "TestAgentUnRegistration.ps1"
Write-Verbose "UnregisterTestAgent script Path  = $unRegisterTestAgentLocation"

$collectionurl = [System.Environment]::GetEnvironmentVariable("SYSTEM_TEAMFOUNDATIONCOLLECTIONURI")
Write-Verbose -Message ("Collection Url : {0}" -f $collectionurl) -Verbose

function NewEnvironmentProvider
{

Write-Verbose "Compiling new Type" -Verbose

$assemblies =  ("Microsoft.TeamFoundation.DistributedTask.Task.DTA","Microsoft.VisualStudio.Services.Client","Microsoft.VisualStudio.Services.WebApi")

$ProgramSource = @"
// Need to load below dlls. see namespace

using Microsoft.VisualStudio.Services.Client;
using System;
using System.Collections.Generic;

// ReSharper disable once CheckNamespace
namespace Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation
{
    public class DtlEnvironmentProviderV2 : IEnvironmentProvider
    {
        #region IEnvironmentProvider impl

        public DtlEnvironmentProviderV2(IEnvironmentProvider innerEnviroment)
        {
            _innerEnvProvider = innerEnviroment;
        }

        /// <summary>
        /// Initialize environment provider instance.
        /// </summary>
        public bool TryInitialize(string serviceUri, string projectName, string environmentName, VssConnection connection)
        {
          return  _innerEnvProvider.TryInitialize(serviceUri,  projectName,  environmentName,  connection);
          
        }

        /// <summary>
        /// Returns Environment URI string.
        /// </summary>
        public string GetEnvironmentUriAsString()
        {
            return Uri.EscapeUriString(_innerEnvProvider.GetEnvironmentUriAsString());
        }

        /// <summary>
        /// Gets the list of machine object given name of machines.
        /// </summary>
        /// <param name="machineNames">List of machine names.</param>
        public List<IMachine> GetMachinesFromMachineNames(List<string> machineNames)
        {   
            return _innerEnvProvider.GetMachinesFromMachineNames(machineNames);
        }

        /// <summary>
        /// Cleans up tags from all machines.
        /// </summary>
        /// <param name="tagKey">Tag key.</param>
        public bool TryRemoveTagsFromMachines(string tagKey)
        {
            return _innerEnvProvider.TryRemoveTagsFromMachines(tagKey);
        }

        /// <summary>
		/// Cleans up tags from a machine.
		/// </summary>
		/// <param name="machineName">Tag key.</param>
        /// <param name="tagKey">Tag key.</param>
        public bool TryRemoveTagsFromMachines(string machineName, string tagKey)
        {
            return _innerEnvProvider.TryRemoveTagsFromMachines(machineName, tagKey);
        }

        /// <summary>
        /// Set up tags on machines.
        /// </summary>
        /// <param name="machines">List of machines where tags needs to be set.</param>
        /// <param name="tagKey">Tag key.</param>
        /// <param name="testData">Tag value.</param>
        public bool TryAddTagsForMachines(List<IMachine> machines, string tagKey, string testData)
        {
            return _innerEnvProvider.TryAddTagsForMachines(machines, tagKey, testData);
        }

        /// <summary>
        /// Gets the machines with a tag specified.
        /// </summary>
        /// <param name="tagKey">The tag key that needs to be searched.</param>
        public List<IMachine> GetMachinesWithTag(string tagKey)
        {
            return _innerEnvProvider.GetMachinesWithTag(tagKey);
        }

        // Name of the provider of the DTL environment
        public string ProviderName
        {
            get
            { 
               return _innerEnvProvider.ProviderName;
            }
        }

        #endregion

        private IEnvironmentProvider _innerEnvProvider;
    }
public class LoggingUtil
{
    public static  void EnableLogging()
    {
        Logger.LogMessage += runTests_LogMessage;
        Logger.LogError += runTests_LogError;
        Logger.LogWarning += runTests_LogWarning;
    }

    public static  void DisableLogging()
    {
        Logger.LogMessage -= runTests_LogMessage;
        Logger.LogError -= runTests_LogError;
        Logger.LogWarning -= runTests_LogWarning;
    }

       private static void runTests_LogMessage(object sender, string message)
        {
            Console.WriteLine(message);
        }

        private static void runTests_LogWarning(object sender, string message)
        {
            Console.WriteLine(message);          
        }

        private static void runTests_LogError(object sender, Exception ex)
        {
          Console.WriteLine(ex);
          throw ex;           
        }
  }
}
"@

Add-Type -TypeDefinition $ProgramSource -Language CSharp -ReferencedAssemblies $assemblies

}

$argumentDictionary = New-Object -TypeName 'System.Collections.Generic.Dictionary[String,String]'

$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionEnvironmentName, $testMachineGroup)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionSourceFilter,$sourcefilters)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionTestcaseFilter,$testFilterCriteria)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionRunSettingsPath,$runSettingsFile)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionTestRunParams,$overrideRunParams)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionTestDropLocation,$dropLocation)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionBuildConfiguration,$configuration)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionBuildPlatform,$platform)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionUnregisterTestAgentScriptLocation,$unregisterTestAgentScriptLocation)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionCodeCoverageEnabled,$codeCoverageEnabled)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionTestConfigurationMapping,$testConfigurations)
$argumentDictionary.Add( [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.Constants]::OptionAutEnvironmentName,$autTestMachineGroup)
 
 
$runTestObject = New-Object -TypeName Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.RunTests -ArgumentList  @($argumentDictionary,$connection) 

Write-Verbose "Calling Invoke-RunDistributedTests"


NewEnvironmentProvider

Try
{
[Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.LoggingUtil]::EnableLogging()

$environmentProviderInstance = $runTestObject.EnvironmentProviderInstance
#check for null etc

$autEnvironmentProviderInstance = $runTestObject.AutEnvironmentProviderInstance

if ($autEnvironmentProviderInstance -ne $null)
{
  $autEnvironmentProviderV2 = New-Object -TypeName Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.DtlEnvironmentProviderV2 -ArgumentList  @($autEnvironmentProviderInstance) 
  $runTestObject.AutEnvironmentProviderInstance = $autEnvironmentProviderV2
}

$environmentProviderInstanceV2 = New-Object -TypeName Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.DtlEnvironmentProviderV2 -ArgumentList  @($environmentProviderInstance) 
$runTestObject.EnvironmentProviderInstance = $environmentProviderInstanceV2

$runTestObject.Run()

Write-Verbose "Leaving script RunDistributedTests.ps1"
}

Finally
{
    [Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation.LoggingUtil]::DisableLogging() 
}