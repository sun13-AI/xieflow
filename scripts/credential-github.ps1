# Local git credential helper: reads the GitHub token stored by GitHub CLI
# (Windows Credential Manager, target "gh:github.com") and feeds it to git.
# The token itself is NEVER written to disk or printed by this script.
param([string]$Action)

$signature = @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credPtr);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  public static string ReadPass(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    string s = null;
    if (c.CredentialBlobSize > 0) {
      byte[] buf = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, buf, 0, c.CredentialBlobSize);
      // gh CLI stores the token as UTF-8/ASCII bytes, not UTF-16
      s = System.Text.Encoding.UTF8.GetString(buf).TrimEnd('\0');
    }
    Marshal.FreeCoTaskMem(p);
    return s;
  }
  public static string ReadUser(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    Marshal.FreeCoTaskMem(p);
    return c.UserName;
  }
}
"@
Add-Type -TypeDefinition $signature

$targets = @("gh:github.com:sun13-AI", "gh:github.com:", "gh:github.com")
$user = $null; $pass = $null
foreach ($t in $targets) {
  $u = [CredMan]::ReadUser($t)
  $p = [CredMan]::ReadPass($t)
  if ($p) { $user = if ($u) { $u } else { "sun13-AI" }; $pass = $p; break }
}

if (-not $pass) { exit 1 }

Write-Output "protocol=https"
Write-Output "host=github.com"
Write-Output "username=$user"
Write-Output "password=$pass"
