using System.Diagnostics;

var npmCommand = Environment.GetEnvironmentVariable("SMC_EVIDENCE_NPM_CMD")
    ?? @"D:\Programs\nvm4w\nodejs\npm.cmd";
var start = new ProcessStartInfo {
    FileName = npmCommand,
    UseShellExecute = true,
};
foreach (var argument in args) start.ArgumentList.Add(argument);
using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start npm.cmd.");
process.WaitForExit();
return process.ExitCode;
