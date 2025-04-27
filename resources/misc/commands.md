## Kill Debugger process 
# Look for .vscode/tasks.json for the task that runs this script.
$p = netstat -ano | findstr :7071 | ForEach-Object {$_.Substring($_.Length-5)} 
Stop-Process -Id $p
