/// <reference path="../../definitions/node.d.ts" /> 
/// <reference path="../../definitions/Q.d.ts" /> 
/// <reference path="../../definitions/vsts-task-lib.d.ts" /> 
 
import path = require("path");
import tl = require("vsts-task-lib/task");
import fs = require("fs");
import util = require("util");
import os = require("os");

var msRestAzure = require("ms-rest-azure");
var asmSchedule = require("azure-asm-scheduler");

import virtualMachine = require("./VirtualMachine");
import resourceGroup = require("./ResourceGroup");
import env = require("./Environment");

try {
    tl.setResourcePath(path.join( __dirname, "task.json"));
}
catch (err) {
    tl.setResult(tl.TaskResult.Failed, tl.loc("TaskNotFound", err));
    process.exit();
}

var TEMP_DIR:string = os.tmpdir();

export class AzureResourceGroupDeployment {

    private connectedServiceNameSelector:string;
    private action:string;
    private actionClassic:string;
    private resourceGroupName:string;
    private cloudService:string;
    private location:string;
    private csmFile:string;
    private csmParametersFile:string;
    private overrideParameters:string;
    private enableDeploymentPrerequisitesForCreate:boolean;
    private enableDeploymentPrerequisitesForSelect:boolean;
    private outputVariable:string;
    private subscriptionId:string;
    private connectedService:string;
    private isLoggedIn:boolean = false;
    private deploymentMode:string;
    private credentials;

    constructor() {
        try { 
            this.connectedServiceNameSelector = tl.getInput("ConnectedServiceNameSelector", true);
            this.connectedService = null;
            if (this.connectedServiceNameSelector === "ConnectedServiceName") {
                this.connectedService = tl.getInput("ConnectedServiceName");
            }
            else {
                this.connectedService = tl.getInput("ConnectedServiceNameClassic");
                console.log("Not Handled yet");
                return;
            }
            this.action = tl.getInput("action");
            this.actionClassic = tl.getInput("actionClassic");
            this.resourceGroupName = tl.getInput("resourceGroupName");
            this.cloudService = tl.getInput("cloudService");
            this.location = tl.getInput("location");
            this.csmFile = tl.getPathInput("csmFile");
            this.csmParametersFile = tl.getPathInput("csmParametersFile");
            this.overrideParameters = tl.getInput("overrideParameters");
            this.enableDeploymentPrerequisitesForCreate = tl.getBoolInput("enableDeploymentPrerequisitesForCreate");
            this.enableDeploymentPrerequisitesForSelect = tl.getBoolInput("enableDeploymentPrerequisitesForSelect");
            this.outputVariable = tl.getInput("outputVariable");
            this.subscriptionId = tl.getEndpointDataParameter(this.connectedService, "SubscriptionId", true);    
            this.deploymentMode = tl.getInput("deploymentMode");
        }
        catch (error) {
            tl.setResult(tl.TaskResult.Failed, tl.loc("ARGD_ConstructorFailed", error.message));
        }
    }
    
    public execute() { 
        try {
            this.credentials = this.getAzureCredentials();
        } catch(error) {
            tl.setResult(tl.TaskResult.Failed, "Error while validating credentials : " + error);
            return;
        }
        if (this.connectedServiceNameSelector === "ConnectedServiceName") {
            switch (this.action) {
                case "Create Or Update Resource Group":
                case "DeleteRG":
                case "Select Resource Group":
                    new resourceGroup.ResourceGroup(this.action, this.connectedService, this.credentials, this.resourceGroupName, this.location, this.csmFile, this.csmParametersFile, this.overrideParameters, this.subscriptionId, this.deploymentMode, this.outputVariable);
                    break;
                case "Start":
                case "Stop":
                case "Restart":
                case "Delete":
                    new virtualMachine.VirtualMachine(this.resourceGroupName, this.action, this.subscriptionId, this.connectedService, this.credentials);
                    break;
                default:
                    tl.setResult(tl.TaskResult.Failed, tl.loc("InvalidAction"));
            }
            if (this.outputVariable && this.outputVariable.trim() != "" && this.action != "Select Resource Group") {
                try {
                    new env.RegisterEnvironment(this.getAzureCredentials(), this.subscriptionId, this.resourceGroupName, this.outputVariable);
                }
                catch (error) {
                    tl.setResult(tl.TaskResult.Failed, tl.loc("FailedRegisteringEnvironment", error));
                }
            }
        }
    }

    private writeFile(fileName:string, contents:string) {
        if (fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
        }
        fs.writeFileSync(fileName, contents);
    } 

    private deleteFile(fileName:string) {
        if (fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
        }
    }

    private createPublishSettingsFile(certificate:string, publishSettingsFile:string) {
        var contents = util.format(`<?xml version="1.0" encoding="utf-8"?>
                                    <PublishData>
                                    <PublishProfile SchemaVersion="2.0" PublishMethod="AzureServiceManagementAPI">
                                    <Subscription ServiceManagementUrl="https://management.core.windows.net" Id="%s" Name="%s" ManagementCertificate="%s" /> 
                                    </PublishProfile>
                                    </PublishData>`, this.subscriptionId, tl.getEndpointDataParameter(this.connectedService, "SubscriptionName", true), certificate);
        try {
            this.writeFile(publishSettingsFile, contents);
        }
        catch(err) {
           this.deleteFile(publishSettingsFile);
           throw new Error("TemporaryPublishSettingsCreationFailed" + err);
        }
    }

    private generateTempPemFile(pemFile:string, endpointAuth):void {
        // Azure Classic
        if (endpointAuth.scheme === "Certificate") {
            var publishSettingsFile:string = TEMP_DIR + "/temp.publishsettings";
            this.createPublishSettingsFile(endpointAuth.parameters["certificate"], publishSettingsFile);
            tl.execSync("azure", "account cert export -f "+ pemFile +" -p "+ publishSettingsFile); // Exports a certificate to temp .pem file path we specified
            this.deleteFile(publishSettingsFile); 
        } else if (endpointAuth.scheme === "UsernamePassword") {
            var username:string = endpointAuth.parameters["username"];
            var password:string = endpointAuth.parameters["password"];
            tl.execSync("azure", "login -u \"" + username + "\" -p \"" + password + "\"");
            tl.execSync("azure", "account cert export -f "+ pemFile)
        } else {
            throw new Error("UnsupportedAuthorizationScheme");
        }
    }

    private getAzureCredentials() {
        try {
            var endpointAuth = tl.getEndpointAuthorization(this.connectedService, true);
            // Azure Resource Manager
            if (this.connectedServiceNameSelector === "ConnectedServiceName") {
                var servicePrincipalId:string = endpointAuth.parameters["serviceprincipalid"];
                var servicePrincipalKey:string = endpointAuth.parameters["serviceprincipalkey"];
                var tenantId:string = endpointAuth.parameters["tenantid"];
                var credentials = new msRestAzure.ApplicationTokenCredentials(servicePrincipalId, tenantId, servicePrincipalKey);
                return credentials;
            } else {
                var pemFile:string = TEMP_DIR + "/temp.pem"; // Temporary .pem file for authentication will be created at this path
                var success = this.generateTempPemFile(pemFile, endpointAuth);
                var certificate = {
                    subscriptionId: tl.getEndpointDataParameter(this.connectedService, "SubscriptionId", true),
                    pem: fs.readFileSync(pemFile)
                };
                this.deleteFile(pemFile);
                tl.execSync("azure", "account clear");
                return asmSchedule.createCertificateCloudCredentials(certificate);
            }
        } catch(error) {
            tl.setResult(tl.TaskResult.Failed, tl.loc("ValidatingCredentialsFailure", error));
        }
    }
}


var azureResourceGroupDeployment = new AzureResourceGroupDeployment();
azureResourceGroupDeployment.execute();
