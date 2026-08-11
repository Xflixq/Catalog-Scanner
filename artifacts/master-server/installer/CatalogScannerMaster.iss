; Inno Setup script for Catalog Scanner Master
; Build with Inno Setup Compiler after `pnpm --filter @workspace/master-server build:exe`
; Output is a Windows installer (.exe). For true MSI, wrap with your MSI tool of choice.

#define MyAppName "Catalog Scanner Master"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DTM Fabrications"
#define MyAppExeName "CatalogScannerMaster.exe"

[Setup]
AppId={{8F3C2A11-6B9E-4D2F-9C71-1A0E5B8D4F22}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\CatalogScannerMaster
DefaultGroupName={#MyAppName}
OutputDir=..\dist\installer
OutputBaseFilename=CatalogScannerMaster-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"

[Files]
; Prefer packaged exe when present; fall back to node runner package.
Source: "..\dist\CatalogScannerMaster.exe"; DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}\..\dist\CatalogScannerMaster.exe'))
Source: "..\dist\catalog-scanner-master.cjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".\run-master.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: ".\README-INSTALL.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\run-master.cmd"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\run-master.cmd"; Tasks: desktopicon

[Run]
Filename: "{app}\run-master.cmd"; Description: "Launch Catalog Scanner Master"; Flags: nowait postinstall skipifsilent
