/// <reference path="../../definitions/vsts-task-lib.d.ts" />

import path = require('path');
import tl = require('vsts-task-lib/task');
import fs = require('fs');
import Q = require('q');
import os = require('os');

var SSHClient = require('ssh2').Client;
var scp2Client = require('scp2');

function findFilesToCopy(sourceFolder, contents) {
    // include filter
    var includeContents: string[] = [];
    // exclude filter
    var excludeContents: string[] = [];

    for (var i: number = 0; i < contents.length; i++){
        var pattern = contents[i].trim();
        var negate: Boolean = false;
        var negateOffset: number = 0;
        for (var j = 0; j < pattern.length && pattern[j] === '!'; j++){
            negate = !negate;
            negateOffset++;
        }

        if(negate){
            tl.debug('exclude content pattern: ' + pattern);
            var realPattern = pattern.substring(0, negateOffset) + path.join(sourceFolder, pattern.substring(negateOffset));
            excludeContents.push(realPattern);
        }
        else{
            tl.debug('include content pattern: ' + pattern);
            var realPattern = path.join(sourceFolder, pattern);
            includeContents.push(realPattern);
        }
    }

    // enumerate all files
    var files: string[] = [];
    var allPaths: string[] = tl.find(sourceFolder);
    var allFiles: string[] = [];

    // remove folder path
    for (var i: number = 0; i < allPaths.length; i++) {
        if (!tl.stats(allPaths[i]).isDirectory()) {
            allFiles.push(allPaths[i]);
        }
    }

    // if we only have exclude filters, we need add a include all filter, so we can have something to exclude.
    if(includeContents.length == 0 && excludeContents.length > 0) {
        includeContents.push('**');
    }

    if (includeContents.length > 0 && allFiles.length > 0) {
        tl.debug("allFiles contains " + allFiles.length + " files");

        // a map to eliminate duplicates
        var map = {};

        // minimatch options
        var matchOptions = { matchBase: true };
        if(os.type().match(/^Win/))
        {
            matchOptions["nocase"] = true;
        }

        // apply include filter
        for (var i: number = 0; i < includeContents.length; i++) {
            var pattern : any = includeContents[i];
            tl.debug('Include matching ' + pattern);

            // let minimatch do the actual filtering
            var matches: string[] = tl.match(allFiles, pattern, matchOptions);

            tl.debug('Include matched ' + matches.length + ' files');
            for (var j: number = 0; j < matches.length; j++) {
                var matchPath = matches[j];
                if (!map.hasOwnProperty(matchPath)) {
                    map[matchPath] = true;
                    files.push(matchPath);
                }
            }
        }

        // apply exclude filter
        for (var i: number = 0; i < excludeContents.length; i++) {
            var pattern : any = excludeContents[i];
            tl.debug('Exclude matching ' + pattern);

            // let minimatch do the actual filtering
            var matches: string[] = tl.match(files, pattern, matchOptions);

            tl.debug('Exclude matched ' + matches.length + ' files');
            files = [];
            for (var j: number = 0; j < matches.length; j++) {
                var matchPath = matches[j];
                files.push(matchPath);
            }
        }
    }
    else {
        tl.debug("Either includeContents or allFiles is empty");
    }
    tl.debug('Files to copy = ' + files);
    return files;
}

function runCommandsUsingSSH(sshConfig, commands) {
    return Q.fcall(() => {
        try {
            var stdout:string = '';

            var client = new SSHClient();
            client.on('ready', function () {
                tl.debug('SSH connection succeeded, client is ready.');
                client.shell(function (err, stream) {
                    if (err) {
                        tl._writeError(err);
                    }
                    stream.on('close', function () {
                        tl._writeLine(stdout);
                        client.end();
                    }).on('data', function (data) {
                        stdout = stdout.concat(data);
                        if (stdout.endsWith('\n')) {
                            tl._writeLine(stdout);
                            stdout = '';
                        }
                    }).stderr.on('data', function (data) {
                            tl._writeError(data);
                        });
                    stream.end(commands);
                    return Q(0);
                });
            }).on('error', function (err) {
                return Q('Failed to connect to remote machine. Verify the SSH endpoint details. Error: '  + err);
            }).connect(sshConfig);
        } catch(err) {
            return Q('Failed to connect to remote machine. Verify the SSH endpoint details. Error: ' + err);
        }
    })
}

function cleanTargetFolderSSH(sshConfig, targetFolder) {
    runCommandsUsingSSH(sshConfig, 'rm -rf ' + targetFolder)
    .then(() => {
            tl.debug('Cleaned up folder on remote machine: ' + targetFolder)
        })
    .fail((err) => {
            tl.setResult(tl.TaskResult.Failed, 'Failed to clean up folder on remote machine: ' + err);
        })
    tl.debug('return from cleanTargetFolderSSH');
}

function createTargetFolderSSH(sshConfig, targetFolder) {
    runCommandsUsingSSH(sshConfig, 'mkdir ' + targetFolder)
        .then(() => {
            tl.debug('Created folder on remote machine: ' + targetFolder)
        })
        .fail((err) => {
            tl.setResult(tl.TaskResult.Failed, 'Failed to create folder on remote machine: ' + err);
        })
    tl.debug('return from createTargetFolderSSH');
}

function scpFile(sshConfig, file, targetFolder) {
    var scpConfig = sshConfig;
    scpConfig.path = targetFolder;
    tl.debug('scp config = ' + scpConfig);
    scp2Client.scp(file, scpConfig, function (err) {
        if (err) {
            return Q(err);
        }
        return Q(0);
    }).then(() => {
        tl.debug('Copied ' + file + ' successfully to ' + targetFolder + ' on remote machine.');

    }).fail((err) => {
        tl.debug('Copy file failed ' + err);
    })
}

var sshEndpoint = tl.getInput('sshEndpoint', true);
var username:string = tl.getEndpointAuthorizationParameter(sshEndpoint, 'username', false);
var password:string = tl.getEndpointAuthorizationParameter(sshEndpoint, 'password', true); //passphrase is optional

var privateKey:string = tl.getEndpointDataParameter(sshEndpoint, 'privateKey', true); //private key is optional, password can be used for connecting
var hostname:string = tl.getEndpointDataParameter(sshEndpoint, 'host', false);
var port:string = tl.getEndpointDataParameter(sshEndpoint, 'port', true); //port is optional, will use 22 as default port if not specified
if(!port || port === '') {
    tl._writeLine('Using port 22 which is the default for SSH since no port was specified.');
    port = '22';
}

// contents is a multiline input containing glob patterns
var contents: string[] = tl.getDelimitedInput('contents', '\n', true);
var sourceFolder: string = tl.getPathInput('sourceFolder', true, true);
var targetFolder: string = tl.getPathInput('targetFolder', true);

var cleanTargetFolder: boolean = tl.getBoolInput('cleanTargetFolder', false);
var overwrite: boolean = tl.getBoolInput('overwrite', false);

var sshConfig;
if (privateKey && privateKey !== '') {
    tl.debug('Using private key and passphrase for connecting.');
    sshConfig = {
        host: hostname,
        port: port,
        username: username,
        privateKey: privateKey,
        passphrase: password,
        path: targetFolder
    }
} else {
    tl.debug('Using password for connecting.');
    sshConfig = {
        host: hostname,
        port: port,
        username: username,
        password: password,
        path: targetFolder
    }
}

var files = findFilesToCopy(sourceFolder, contents);
console.log(tl.loc('FoundNFiles', files.length));

// copy the files to the target folder
if (files.length > 0) {
    // dump all files to debug trace.
    files.forEach((file: string) => {
        tl.debug('file:' + file + ' will be copied.');
    })

    // clean target folder if required
    if (cleanTargetFolder) {
        console.log(tl.loc('CleaningTargetFolder', targetFolder));
        cleanTargetFolderSSH(sshConfig, targetFolder);
    }

    // make sure the target folder exists
    createTargetFolderSSH(sshConfig, targetFolder);

    var commonRoot: string = "";
    try {
        var createdFolders = {};
        files.forEach((file: string) => {
            var relativePath = file.substring(sourceFolder.length)
                .replace(/^\\/g, "")
                .replace(/^\//g, "");

            var targetPath = path.join(targetFolder, relativePath);
            var targetDir = path.dirname(targetPath);

            if (!createdFolders[targetDir]) {
                tl.debug("Creating folder " + targetDir);
                createTargetFolderSSH(sshConfig, targetDir);
                createdFolders[targetDir] = true;
            }

            scpFile(sshConfig, file, targetDir);
        });
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}