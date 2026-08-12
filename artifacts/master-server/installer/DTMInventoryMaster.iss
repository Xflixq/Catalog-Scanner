; Inno Setup 6 - DTM Inventory Master
#define MyAppName "DTM Inventory Master"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "DTM"
#define MyAppURL "http://127.0.0.1:47821"
#define MyAppExeName "Launch Master.vbs"

[Setup]
AppId={{8F3C2A11-6B9E-4D2F-9C71-1A0E5B8D4F22}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\DTMInventoryMaster
DefaultGroupName=DTM Inventory
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=DTMInventory-Setup
SetupIconFile=assets\app.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120
WizardImageFile=assets\wizard-modern.bmp
WizardSmallImageFile=assets\wizard-small.bmp
WizardImageStretch=yes
WizardImageBackColor=$293588
DisableWelcomePage=no
ShowLanguageDialog=no
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
VersionInfoVersion=1.0.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
VersionInfoProductName=DTM Inventory
SetupLogging=yes
CloseApplications=force
DirExistsWarning=no
AllowNoIcons=yes
UsePreviousAppDir=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
SetupAppTitle=DTM Inventory Setup
SetupWindowTitle=DTM Inventory Setup
WelcomeLabel1=Welcome to DTM Inventory
WelcomeLabel2=This sets up the Master PC for DTM Inventory: shared catalog database, Android tether QR, and login codes for other PCs.%n%nClick Next to continue.
FinishedHeadingLabel=Installation complete
FinishedLabelNoIcons=DTM Inventory Master is installed.
FinishedLabel=DTM Inventory Master is installed.
ClickFinish=Click Finish to exit Setup.
BeveledLabel=DTM Inventory

[CustomMessages]
LaunchAfter=Open DTM Inventory Master
DesktopIcon=Create a desktop shortcut
StartMenuIcon=Create a Start Menu shortcut

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "Shortcuts:"; Flags: unchecked
Name: "startmenu"; Description: "{cm:StartMenuIcon}"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Files]
Source: "..\dist\DTMInventoryMaster.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\dist\dtm-inventory-master.cjs"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\dist\dtm-inventory-master.cjs"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\dist\payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: ".\Launch Master.vbs"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: ".\run-master.cmd"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: ".\README-INSTALL.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\DTM Inventory Master"; Filename: "{sys}\wscript.exe"; Parameters: "//B ""{app}\Launch Master.vbs"""; WorkingDir: "{app}"; Tasks: startmenu
Name: "{group}\Uninstall DTM Inventory Master"; Filename: "{uninstallexe}"; Tasks: startmenu
Name: "{autodesktop}\DTM Inventory Master"; Filename: "{sys}\wscript.exe"; Parameters: "//B ""{app}\Launch Master.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: "//B ""{app}\Launch Master.vbs"""; Description: "{cm:LaunchAfter}"; Flags: nowait postinstall skipifsilent; WorkingDir: "{app}"
