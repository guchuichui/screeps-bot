param(
    [string]$TaskName = 'Screeps-Hourly-ReadOnly',
    [string]$PythonPath,
    [string]$SamplerPath,
    [string]$EvidencePath,
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
if (-not $VerifyOnly) {
    if (-not $PythonPath) { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
    $PythonPath = (Resolve-Path -LiteralPath $PythonPath).Path
    $SamplerPath = (Resolve-Path -LiteralPath $SamplerPath -ErrorAction Stop).Path
    if ($SamplerPath.Contains('"')) { throw 'Invalid sampler path' }
    $action = New-ScheduledTaskAction -Execute $PythonPath -Argument ('"' + $SamplerPath + '"') -WorkingDirectory (Split-Path -Parent $SamplerPath)
    $nextHour = (Get-Date).Date.AddHours((Get-Date).Hour + 1)
    $trigger = New-ScheduledTaskTrigger -Once -At $nextHour -RepetitionInterval (New-TimeSpan -Hours 1)
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}
[xml]$xml = Export-ScheduledTask -TaskName $TaskName
$interval = [string]$xml.Task.Triggers.TimeTrigger.Repetition.Interval
$minutes = [System.Xml.XmlConvert]::ToTimeSpan($interval).TotalMinutes
if ($minutes -ne 60 -or $xml.Task.Settings.MultipleInstancesPolicy -ne 'IgnoreNew') { throw 'Schedule verification failed' }
$info = Get-ScheduledTaskInfo -TaskName $TaskName
$evidence = [ordered]@{
    taskName=$TaskName; interval=$interval; intervalMinutes=$minutes
    multipleInstances=[string]$xml.Task.Settings.MultipleInstancesPolicy
    startBoundary=[string]$xml.Task.Triggers.TimeTrigger.StartBoundary
    executionTimeLimit=[string]$xml.Task.Settings.ExecutionTimeLimit
    execute=[string]$xml.Task.Actions.Exec.Command; arguments=[string]$xml.Task.Actions.Exec.Arguments
    logonType=[string]$xml.Task.Principals.Principal.LogonType
    lastRunTime=$info.LastRunTime.ToString('o'); lastTaskResult=$info.LastTaskResult
    nextRunTime=$info.NextRunTime.ToString('o'); verifiedAt=(Get-Date).ToString('o')
}
$json = $evidence | ConvertTo-Json
if ($EvidencePath) { $json | Set-Content -LiteralPath $EvidencePath -Encoding utf8 }
$json
