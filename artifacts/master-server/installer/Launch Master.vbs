Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
dataDir = sh.ExpandEnvironmentStrings("%ProgramData%") & "\DTMInventory"
sh.Environment("Process")("CATALOG_SCANNER_DATA_DIR") = dataDir
sh.Environment("Process")("DTM_INVENTORY_DATA_DIR") = dataDir
Set fso = CreateObject("Scripting.FileSystemObject")
exe = sh.CurrentDirectory & "\DTMInventoryMaster.exe"
If fso.FileExists(exe) Then
  sh.Run """" & exe & """", 1, False
  WScript.Quit 0
End If
entry = sh.CurrentDirectory & "\src\gui\master\main.mjs"
If fso.FileExists(entry) Then
  localElectron = sh.CurrentDirectory & "\node_modules\electron\cli.js"
  If fso.FileExists(localElectron) Then
    sh.Run "node """ & localElectron & """ """ & entry & """", 0, False
  Else
    sh.Run "cmd /c npx --yes electron@33.2.1 """ & entry & """", 0, False
  End If
  WScript.Quit 0
End If
bundle = sh.CurrentDirectory & "\dtm-inventory-master.cjs"
If fso.FileExists(bundle) Then
  sh.Run "node """ & bundle & """", 0, False
  WScript.Quit 0
End If
MsgBox "DTM Inventory Master files are missing.", 16, "DTM Inventory"
