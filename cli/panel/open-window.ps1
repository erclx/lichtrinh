# Shows the panel as one chromeless Edge window, bringing back the one already
# open. It waits for the panel to answer first, since a window opened ahead of
# it stays on the browser's own error page, and for the window to carry its
# title after, since the next run looks for it by that.
param(
  [Parameter(Mandatory)] [string] $Url,
  [Parameter(Mandatory)] [string] $Title
)

$ProgressPreference = 'SilentlyContinue'
$restore = 9

Add-Type -Namespace Lichtrinh -Name Window -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern IntPtr FindWindow(string className, string title);
[DllImport("user32.dll")]
public static extern bool IsIconic(IntPtr window);
[DllImport("user32.dll")]
public static extern bool ShowWindow(IntPtr window, int command);
[DllImport("user32.dll")]
public static extern bool SetForegroundWindow(IntPtr window);
'@

function Find-Panel {
  [Lichtrinh.Window]::FindWindow([NullString]::Value, $Title)
}

$window = Find-Panel
if ($window -ne [IntPtr]::Zero) {
  if ([Lichtrinh.Window]::IsIconic($window)) {
    [void] [Lichtrinh.Window]::ShowWindow($window, $restore)
  }
  [void] [Lichtrinh.Window]::SetForegroundWindow($window)
  exit 0
}

foreach ($try in 1..30) {
  try {
    [void] (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$Url/api/state")
    break
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

Start-Process msedge "--app=$Url"

foreach ($try in 1..40) {
  if ((Find-Panel) -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 250
}
