ConfigureWinRM.ps1 : Master script used to configure on the WinRM on the remote machine

Set-WinRMExtension.ps1: Script to execute add the WinRM VM Extension to the azure remote machine

Validate-WinRMExtension: Test script used to vlaidate the winrm connection

winrmconf.cmd: Sample batch script getting consumed by ConfigureWinRM.ps1

makecert.exe: Application used to create the test certificate, getting consumed by the CondigureWinRM.ps1