/// <reference path="../../definitions/node.d.ts" /> 
/// <reference path="../../definitions/Q.d.ts" /> 
/// <reference path="../../definitions/vsts-task-lib.d.ts" /> 
 
import path = require("path");
import tl = require("vsts-task-lib/task");
import fs = require("fs");
import util = require("util");

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
        if (this.connectedServiceNameSelector === "ConnectedServiceName") {
            switch (this.action) {
                case "Create Or Update Resource Group":
                case "DeleteRG":
                case "Select Resource Group":
                    new resourceGroup.ResourceGroup(this.action, this.connectedService, this.getARMCredentials(), this.resourceGroupName, this.location, this.csmFile, this.csmParametersFile, this.overrideParameters, this.subscriptionId, this.deploymentMode, this.outputVariable);
                    break;
                case "Start":
                case "Stop":
                case "Restart":
                case "Delete":
                    new virtualMachine.VirtualMachine(this.resourceGroupName, this.action, this.subscriptionId, this.connectedService, this.getARMCredentials());
                    break;
                default:
                    tl.setResult(tl.TaskResult.Succeeded, tl.loc("InvalidAction"));
            }
            if (this.outputVariable && this.outputVariable.trim() != "" && this.action != "Select Resource Group" && this.action != "Select Cloud Service") {
                try {
                    new env.RegisterEnvironment(this.getARMCredentials(), this.subscriptionId, this.resourceGroupName, this.outputVariable);
                }
                catch (error) {
                    tl.setResult(tl.TaskResult.Failed, tl.loc("FailedRegisteringEnvironment", error));
                }
            }
        }
    }

    private createPublishSettingsFile(certificate:string, publishSettingsFile:string) {
        var contents = util.format('<?xml version="1.0" encoding="utf-8"?><PublishData><PublishProfile SchemaVersion="2.0" PublishMethod="AzureServiceManagementAPI"><Subscription ServiceManagementUrl="https://management.core.windows.net" Id="%s" Name="%s" ManagementCertificate="%s" /> </PublishProfile></PublishData>', this.subscriptionId, tl.getEndpointDataParameter(this.connectedService, "SubscriptionName", true), certificate);
        try {
            fs.writeFileSync(publishSettingsFile, contents);
        }
        catch(err) {
           fs.unlinkSync(publishSettingsFile);
           tl.setResult(tl.TaskResult.Failed, "Failed while creating temparory publish Settings file " + err);
        }
    }
     private getARMCredentials() {
        var endpointAuth = tl.getEndpointAuthorization(this.connectedService, true);
        if (this.connectedServiceNameSelector === "ConnectedServiceName") {
            var servicePrincipalId:string = endpointAuth.parameters["serviceprincipalid"];
            var servicePrincipalKey:string = endpointAuth.parameters["serviceprincipalkey"];
            var tenantId:string = endpointAuth.parameters["tenantid"];
            var credentials = new msRestAzure.ApplicationTokenCredentials(servicePrincipalId, tenantId, servicePrincipalKey);
            return credentials;
        } else {
            var pemFile:string = __dirname+"/temp.pem";
            if (endpointAuth.scheme === "Certificate") {
                var publishSettingsFile:string = __dirname+"/temp.publishsettings";
                this.createPublishSettingsFile(endpointAuth.parameters["certificate"], publishSettingsFile);
                tl.execSync("azure", "account cert export -f "+pemFile+" -p "+ publishSettingsFile);
                fs.unlinkSync(publishSettingsFile);
            } else if (endpointAuth.scheme === "UsernamePassword") {
                var username:string = endpointAuth.parameters["username"];
                var password:string = endpointAuth.parameters["password"];
                tl.execSync("azure", "login -u \"" + username + "\" -p \"" + password + "\"");
                tl.execSync("azure", "account cert export -f "+ pemFile)
            } else {
                tl.setResult(tl.TaskResult.Failed, "Unsupported Authorization Scheme");
                return;
            }
            if (fs.existsSync(pemFile)) {
                var certificate = {
                    subscriptionId: tl.getEndpointDataParameter(this.connectedService, "SubscriptionId", true),
                    pem: fs.readFileSync(pemFile)
                };
                fs.unlink(pemFile);
                tl.execSync("azure", "account clear");
                return asmSchedule.createCertificateCloudCredentials(certificate);
            } else {
                tl.setResult(tl.TaskResult.Failed, "Failed while validating credentials");
                return;
            }
        }

    }
}


var azureResourceGroupDeployment = new AzureResourceGroupDeployment();
azureResourceGroupDeployment.execute();
