; Inno Setup 6 - Catalog Scanner Master
; Black/white wizard matching Catalog Scanner UI.
; Build: .\artifacts\master-server\installer\build-setup.ps1

#define MyAppName "Catalog Scanner Master"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DTM Fabrications"
#define MyAppURL "http://127.0.0.1:47821"
#define MyAppExeName "run-master.cmd"

[Setup]
AppId={{8F3C2A11-6B9E-4D2F-9C71-1A0E5B8D4F22}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\CatalogScannerMaster
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=CatalogScannerMaster-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120
WizardImageFile=assets\wizard-modern.bmp
WizardSmallImageFile=assets\wizard-small.bmp
WizardImageStretch=yes
WizardImageBackColor=clBlack
DisableWelcomePage=no
ShowLanguageDialog=no
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
VersionInfoVersion=1.0.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
VersionInfoProductName={#MyAppName}
SetupLogging=yes
CloseApplications=force
DirExistsWarning=no
AllowNoIcons=yes
UsePreviousAppDir=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
SetupAppTitle=Catalog Scanner Master Setup
SetupWindowTitle=Catalog Scanner Master Setup
WelcomeLabel1=Welcome to Catalog Scanner Master
WelcomeLabel2=This installs the master PC service that hosts your shared catalog database, tether QR pairing for Android, and login codes for other PCs.%n%nRecommended: install on the always-on PC that scanners and other machines will connect to.%n%nClick Next to continue.
FinishedHeadingLabel=Installation complete
FinishedLabelNoIcons=Catalog Scanner Master is installed. Launch it to open the black/white console and show the tether QR.
FinishedLabel=Catalog Scanner Master is installed. Launch it to open the black/white console and show the tether QR.
ClickFinish=Click Finish to exit Setup.
ConfirmUninstall=Uninstall Catalog Scanner Master from this PC?%n%nYour catalog database under ProgramData is kept unless you remove it manually.
BeveledLabel=DTM Fabrications - Catalog Scanner

[CustomMessages]
LaunchAfter=Launch Catalog Scanner Master now
DesktopIcon=Create a desktop shortcut
StartMenuIcon=Create a Start Menu shortcut

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "startmenu"; Description: "{cm:StartMenuIcon}"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Files]
Source: "..\dist\CatalogScannerMaster.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\dist\catalog-scanner-master.cjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".\run-master.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: ".\README-INSTALL.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "Open Catalog Scanner Master console"; Tasks: startmenu
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"; Tasks: startmenu
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchAfter}"; Flags: nowait postinstall skipifsilent shellexec; WorkingDir: "{app}"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"

[Code]
procedure InitializeWizard;
begin
  WizardForm.Color := clWhite;
  WizardForm.MainPanel.Color := clWhite;
  WizardForm.InnerPage.Color := clWhite;
  WizardForm.WelcomeLabel1.Font.Color := clBlack;
  WizardForm.WelcomeLabel2.Font.Color := clBlack;
  WizardForm.FinishedHeadingLabel.Font.Color := clBlack;
  WizardForm.FinishedLabel.Font.Color := clBlack;
  WizardForm.PageNameLabel.Font.Color := clBlack;
  WizardForm.PageDescriptionLabel.Font.Color := clBlack;
end;
