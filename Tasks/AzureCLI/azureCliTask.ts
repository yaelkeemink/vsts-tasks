/// <reference path="../../definitions/node.d.ts" />
/// <reference path="../../definitions/Q.d.ts" />
/// <reference path="../../definitions/vsts-task-lib.d.ts" />

import path = require('path');
import tl = require('vsts-task-lib/task');

async function run() {
    try {    
        tl.setResourcePath(path.join( __dirname, 'task.json'));
        
        var connectedServiceName = tl.getInput('ConnectedServiceName', true);
        var endpointAuth = tl.getEndpointAuthorization(connectedServiceName, true);
        
        var servicePrincipalId = endpointAuth.parameters["serviceprincipalid"];
        var servicePrincipalKey = endpointAuth.parameters["serviceprincipalkey"];
        var tenantId = endpointAuth.parameters["tenantid"];
        
        var azureConfig = tl.createToolRunner(tl.which('azure', true));
        azureConfig.argString("config mode arm");
        azureConfig.execSync();
        
        var azureLogin = tl.createToolRunner(tl.which('azure', true));
        azureLogin.arg("login");
        azureLogin.arg("-u");
        azureLogin.arg(servicePrincipalId);
        azureLogin.arg("-p");
        azureLogin.arg(servicePrincipalKey);
        azureLogin.arg("--tenant");
        azureLogin.arg(tenantId);
        azureLogin.arg("--service-principal");
        
        azureLogin.execSync();

        var bash = tl.createToolRunner(tl.which('bash', true));

        var scriptPath: string = tl.getPathInput('scriptPath', true, true);
        var cwd: string = tl.getPathInput('cwd', true, false);

        // if user didn't supply a cwd (advanced), then set cwd to folder script is in.
        // All "script" tasks should do this
        if (!tl.filePathSupplied('cwd') && !tl.getBoolInput('disableAutoCwd', false)) {
            cwd = path.dirname(scriptPath);
        }
        tl.mkdirP(cwd);
        tl.cd(cwd);

        bash.pathArg(scriptPath);

        // additional args should always call argString.  argString() parses quoted arg strings
        bash.argString(tl.getInput('args', false));

        // determines whether output to stderr will fail a task.
        // some tools write progress and other warnings to stderr.  scripts can also redirect.
        var failOnStdErr: boolean = tl.getBoolInput('failOnStandardError', false);

        var code: number = await bash.exec(<any>{failOnStdErr: failOnStdErr});
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('BashReturnCode', code));
    }
    catch(err) {
        tl.setResult(tl.TaskResult.Failed, tl.loc('BashFailed', err.message));
    } 
    finally {
        // add logout on failure or completion;
    }   
}

run();