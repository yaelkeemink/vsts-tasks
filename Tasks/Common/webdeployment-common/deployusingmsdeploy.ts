import tl = require('vsts-task-lib/task');
import fs = require('fs');
import path = require('path');
import Q = require('q');

var msDeployUtility = require('./msdeployutility.js');
var utility = require('./utility.js');

/**
 * Executes Web Deploy command
 * 
 * @param   webDeployPkg                   Web deploy package
 * @param   webAppName                      web App Name
 * @param   publishingProfile               Azure RM Connection Details
 * @param   removeAdditionalFilesFlag       Flag to set DoNotDeleteRule rule
 * @param   excludeFilesFromAppDataFlag     Flag to prevent App Data from publishing
 * @param   takeAppOfflineFlag              Flag to enable AppOffline rule
 * @param   virtualApplication              Virtual Application Name
 * @param   setParametersFile               Set Parameter File path
 * @param   additionalArguments             Arguments provided by user
 * 
 */
export async function DeployUsingMSDeploy(webDeployPkg, webAppName, publishingProfile, removeAdditionalFilesFlag, 
        excludeFilesFromAppDataFlag, takeAppOfflineFlag, virtualApplication, setParametersFile, additionalArguments, isFolderBasedDeployment, useWebDeploy): Promise<boolean> {
    let defer: Q.Deferred<boolean> = Q.defer<boolean>();
    let msDeployPath: string = await msDeployUtility.getMSDeployFullPath();
    let msDeployDirectory: string = msDeployPath.slice(0, msDeployPath.lastIndexOf('\\') + 1);
    let pathVar: string = process.env.PATH;
    process.env.PATH = msDeployDirectory + ";" + process.env.PATH ;

    setParametersFile = utility.copySetParamFileIfItExists(setParametersFile);
    let setParametersFileName: string = null;
    if(setParametersFile != null) {
        setParametersFileName = setParametersFile.slice(setParametersFile.lastIndexOf('\\') + 1, setParametersFile.length);
    }
    let isParamFilePresentInPackage: boolean = isFolderBasedDeployment ? false : await msDeployUtility.containsParamFile(webDeployPkg);
    let msDeployCmdArgs: string = msDeployUtility.getMSDeployCmdArgs(webDeployPkg, webAppName, publishingProfile, removeAdditionalFilesFlag,
        excludeFilesFromAppDataFlag, takeAppOfflineFlag, virtualApplication, setParametersFileName, additionalArguments, isParamFilePresentInPackage, isFolderBasedDeployment, 
        useWebDeploy);

    let errorFile: string = path.join(tl.getVariable('System.DefaultWorkingDirectory'),"error.txt");
    let errWs: fs.WriteStream = fs.createWriteStream(errorFile);
     
     errWs.on('finish', () => {
         msDeployUtility.redirectMSDeployErrorToConsole();
     });

     errWs.on('open', async (fd: number) => {
         try {
             let rc: number = await tl.exec("msdeploy", msDeployCmdArgs, <any>{failOnStdErr: true, errStream: errWs});
             if(publishingProfile != null) {
                 console.log(tl.loc('WebappsuccessfullypublishedatUrl0', publishingProfile.destinationAppUrl));
             }
             defer.resolve(true);
         }
         catch(error) {
             defer.reject(new Error(error.message));
         }
         finally {
             errWs.end();
             process.env.PATH = pathVar;
             if(setParametersFile != null) {
                 tl.rmRF(setParametersFile, true);
             }
         }
     });

     return <Q.Promise<boolean>> defer.promise;
}