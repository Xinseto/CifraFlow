; Script Inno Setup para gerar o Instalador Gráfico Windows (CifraFlow-Setup-v1.0.0-win-x64.exe)
#define MyAppName "CifraFlow - Leitor de Cifras"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Douglas Freitas"
#define MyAppURL "https://github.com/Xinseto/CifraFlow"

[Setup]
AppId={{8E74A34C-52B1-4F2A-9E88-CIFRAFLOW100}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\CifraFlow
DefaultGroupName=CifraFlow
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=CifraFlow-Setup-v{#MyAppVersion}-win-x64
SetupIconFile=..\src\assets\icon.ico
UninstallDisplayIcon={app}\src\assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\CifraFlow.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\native-host\*"; DestDir: "{app}\native-host"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\sample-cifras\*"; DestDir: "{app}\sample-cifras"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\bin\*.dll"; DestDir: "{app}\bin"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\CifraFlow.bat"; WorkingDir: "{app}"; IconFilename: "{app}\src\assets\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\CifraFlow.bat"; WorkingDir: "{app}"; IconFilename: "{app}\src\assets\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\CifraFlow.bat"; Description: "Iniciar o CifraFlow agora"; Flags: nowait postinstall skipifsilent shellexec
