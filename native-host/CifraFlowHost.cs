using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace CifraFlow
{
    public class CifraFlowForm : Form
    {
        private WebView2 webView;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private readonly string appRootDir;
        private readonly string srcDir;
        private readonly string settingsFilePath;
        private readonly bool isSelfTest;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        public CifraFlowForm(bool selfTest, string explicitRootDir = null)
        {
            this.isSelfTest = selfTest;
            this.Text = "CifraFlow - Leitor de Cifras";
            this.Width = 1320;
            this.Height = 840;
            this.MinimumSize = new Size(360, 620);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(12, 14, 19);

            string cwd = Environment.CurrentDirectory;
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            if (!string.IsNullOrWhiteSpace(explicitRootDir) && Directory.Exists(Path.Combine(explicitRootDir, "src")))
            {
                this.appRootDir = explicitRootDir;
            }
            else if (Directory.Exists(Path.Combine(cwd, "src")))
            {
                this.appRootDir = cwd;
            }
            else if (Directory.Exists(Path.Combine(exeDir, "src")))
            {
                this.appRootDir = exeDir;
            }
            else
            {
                this.appRootDir = Path.GetFullPath(Path.Combine(exeDir, ".."));
            }

            this.srcDir = Path.Combine(this.appRootDir, "src");
            try
            {
                string icoPath = Path.Combine(this.srcDir, "assets", "icon.ico");
                if (File.Exists(icoPath))
                {
                    this.Icon = new Icon(icoPath);
                }
            }
            catch { }
            string binDir = Path.Combine(this.appRootDir, "bin");
            if (Directory.Exists(binDir))
            {
                SetDllDirectory(binDir);
            }

            string appData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "CifraFlow"
            );
            Directory.CreateDirectory(appData);
            this.settingsFilePath = Path.Combine(appData, "settings.json");

            this.Load += (s, e) =>
            {
                ApplyDarkTitleBar();
                InitializeWebView();
            };
            this.FormClosing += (s, e) =>
            {
                try
                {
                    if (webView != null)
                    {
                        webView.Dispose();
                        webView = null;
                    }
                }
                catch { }
            };
            this.Shown += (s, e) =>
            {
                // Garante que a janela GUI do CifraFlow apareça sempre visível e na frente do Windows Explorer
                ShowWindow(this.Handle, 1); // SW_SHOWNORMAL
                this.WindowState = FormWindowState.Normal;
                this.TopMost = true;
                this.BringToFront();
                this.Activate();
                SetForegroundWindow(this.Handle);
                this.TopMost = false;
            };
        }

        private void ApplyDarkTitleBar()
        {
            try
            {
                int useDark = 1;
                DwmSetWindowAttribute(this.Handle, 20, ref useDark, sizeof(int));
                DwmSetWindowAttribute(this.Handle, 19, ref useDark, sizeof(int));
            }
            catch
            {
                // Ignora em versões antigas do Windows
            }
        }

        private async void InitializeWebView()
        {
            try
            {
                webView = new WebView2
                {
                    Dock = DockStyle.Fill,
                    DefaultBackgroundColor = Color.FromArgb(12, 14, 19)
                };
                this.Controls.Add(webView);

                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "CifraFlow",
                    "WebView2Data"
                );
                Directory.CreateDirectory(userDataFolder);

                bool needFallback = false;
                try
                {
                    var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                    await webView.EnsureCoreWebView2Async(env);
                }
                catch
                {
                    needFallback = true;
                }

                if (needFallback)
                {
                    string fallbackFolder = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "CifraFlow",
                        "WebView2Data_" + System.Diagnostics.Process.GetCurrentProcess().Id
                    );
                    Directory.CreateDirectory(fallbackFolder);
                    var envFallback = await CoreWebView2Environment.CreateAsync(null, fallbackFolder);
                    await webView.EnsureCoreWebView2Async(envFallback);
                }

                // Auto-aprova permissão de Microfone para o Afinador de Violão em tempo real
                webView.CoreWebView2.PermissionRequested += (s, e) =>
                {
                    if (e.PermissionKind == CoreWebView2PermissionKind.Microphone)
                    {
                        e.State = CoreWebView2PermissionState.Allow;
                    }
                };

                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                // Mapeia a pasta src/ para um domínio virtual seguro local (100% offline, zero servidor HTTP)
                webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "cifraflow.local",
                    this.srcDir,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

                if (this.isSelfTest)
                {
                    webView.CoreWebView2.NavigationCompleted += async (s, e) =>
                    {
                        await System.Threading.Tasks.Task.Delay(900);
                        string shotDir = Path.Combine(this.appRootDir, "docs", "screenshots");
                        Directory.CreateDirectory(shotDir);

                        // 1. Verifica Leitor (1 Coluna + Auto-Scroll + Destaque Laranja)
                        await CapturePng(Path.Combine(shotDir, "01-reader-dark.png"));

                        // 2. Testa Auto-Scroll (+ / - / 1) e Visualização em 2 Colunas
                        string step1Js = @"
                            (function() {
                                var app = window.cifraFlowApp;
                                var initialSpeed = app.state.autoScroll.speed;
                                app.handleAdjustScrollSpeed(1);
                                var speedAfterPlus = app.state.autoScroll.speed;
                                app.handleAdjustScrollSpeed(-1);
                                var speedAfterMinus = app.state.autoScroll.speed;
                                app.updateSetting('columns', 2);
                                return JSON.stringify({ initialSpeed: initialSpeed, speedAfterPlus: speedAfterPlus, speedAfterMinus: speedAfterMinus });
                            })();
                        ";
                        string scrollRes = await webView.CoreWebView2.ExecuteScriptAsync(step1Js);
                        await System.Threading.Tasks.Task.Delay(350);
                        await CapturePng(Path.Combine(shotDir, "02-reader-2columns.png"));

                        // Restaura 1 coluna e abre aba Editor (.txt)
                        await webView.CoreWebView2.ExecuteScriptAsync("window.cifraFlowApp.updateSetting('columns', 1); window.cifraFlowApp.switchTab('editor');");
                        await System.Threading.Tasks.Task.Delay(350);
                        await CapturePng(Path.Combine(shotDir, "03-editor-txt.png"));

                        // 3. Abre aba Afinador de Violão e testa detecção DSP (A2 110Hz afinada)
                        await webView.CoreWebView2.ExecuteScriptAsync("window.cifraFlowApp.switchTab('tuner'); window.cifraFlowApp.state.tuner.selectedStringIdx = 1; window.cifraFlowApp.simulateCurrentString(0);");
                        await System.Threading.Tasks.Task.Delay(450);
                        await CapturePng(Path.Combine(shotDir, "04-tuner-guitar.png"));

                        // 4. Testa Responsividade Mobile (Proporção Smartphone 410x780)
                        this.Width = 410;
                        this.Height = 780;
                        await webView.CoreWebView2.ExecuteScriptAsync("window.cifraFlowApp.toggleSidebar(false); window.cifraFlowApp.switchTab('reader');");
                        await System.Threading.Tasks.Task.Delay(400);
                        await CapturePng(Path.Combine(shotDir, "05-mobile-responsive.png"));

                        string finalCheckJs = @"
                            (function() {
                                var chords = document.querySelectorAll('.chord-token').length;
                                var speed = document.getElementById('scroll-speed-value') ? document.getElementById('scroll-speed-value').textContent : '';
                                var songs = document.querySelectorAll('.song-item').length;
                                var note = document.getElementById('tuner-detected-note') ? document.getElementById('tuner-detected-note').textContent : '';
                                return JSON.stringify({
                                    ok: chords > 0 && speed === '1' && songs > 0 && note === 'A2',
                                    chords: chords,
                                    speed: speed,
                                    songs: songs,
                                    tunerNote: note
                                });
                            })();
                        ";
                        string res = await webView.CoreWebView2.ExecuteScriptAsync(finalCheckJs);
                        Console.WriteLine("SELF_TEST_SCROLL:" + scrollRes);
                        Console.WriteLine("SELF_TEST_RESULT:" + res);
                        this.Close();
                    };
                }

                webView.CoreWebView2.Navigate("https://cifraflow.local/index.html");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("WEBVIEW2_INIT_ERROR:" + ex.ToString());
                if (this.isSelfTest)
                {
                    this.Close();
                }
            }
        }

        private async System.Threading.Tasks.Task CapturePng(string filePath)
        {
            try
            {
                using (var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write))
                {
                    await webView.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
                }
            }
            catch { }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string id = "";
            try
            {
                string raw = e.TryGetWebMessageAsString();
                var msg = json.Deserialize<Dictionary<string, object>>(raw);
                id = msg.ContainsKey("id") ? Convert.ToString(msg["id"]) : "";
                string action = msg.ContainsKey("action") ? Convert.ToString(msg["action"]) : "";
                var payload = msg.ContainsKey("payload") && msg["payload"] is Dictionary<string, object>
                    ? (Dictionary<string, object>)msg["payload"]
                    : new Dictionary<string, object>();

                object result = HandleAction(action, payload);
                SendResponse(id, result, null);
            }
            catch (Exception ex)
            {
                SendResponse(id, null, ex.Message);
            }
        }

        private object HandleAction(string action, Dictionary<string, object> payload)
        {
            switch (action)
            {
                case "init":
                    return HandleInit();
                case "openFolderDialog":
                    string initial = payload.ContainsKey("initialFolder") ? Convert.ToString(payload["initialFolder"]) : "";
                    return HandleOpenFolderDialog(initial);
                case "scanDirectory":
                    string dir = payload.ContainsKey("folderPath") ? Convert.ToString(payload["folderPath"]) : "";
                    return ScanDirectoryForTxt(dir);
                case "readTextFile":
                    string readPath = Convert.ToString(payload["fullPath"]);
                    return new Dictionary<string, object> { { "content", ReadTextSmartEncoding(readPath) } };
                case "writeTextFile":
                    string writePath = Convert.ToString(payload["fullPath"]);
                    string content = Convert.ToString(payload["content"]);
                    File.WriteAllText(writePath, content, new UTF8Encoding(false));
                    return new Dictionary<string, object> { { "success", true }, { "fullPath", writePath } };
                case "createTextFile":
                    return HandleCreateTextFile(payload);
                case "saveSettings":
                    if (payload.ContainsKey("settings"))
                    {
                        string settingsJson = json.Serialize(payload["settings"]);
                        File.WriteAllText(this.settingsFilePath, settingsJson, new UTF8Encoding(false));
                    }
                    return new Dictionary<string, object> { { "saved", true } };
                default:
                    throw new InvalidOperationException("Ação desconhecida: " + action);
            }
        }

        private object HandleInit()
        {
            var settings = LoadSettings();
            string folder = settings.ContainsKey("lastFolder") ? Convert.ToString(settings["lastFolder"]) : "";

            if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
            {
                folder = DetectDefaultMusicFolder();
            }

            var scan = ScanDirectoryForTxt(folder);
            return new Dictionary<string, object>
            {
                { "settings", settings },
                { "currentFolder", folder },
                { "files", scan["files"] }
            };
        }

        private string DetectDefaultMusicFolder()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                if (Directory.Exists(desktop))
                {
                    foreach (string sub in Directory.GetDirectories(desktop))
                    {
                        string name = Path.GetFileName(sub);
                        if (name.IndexOf("Simplificadas", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Cifra", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            return sub;
                        }
                    }
                }
            }
            catch { }

            string sampleDir = Path.Combine(this.appRootDir, "sample-cifras");
            Directory.CreateDirectory(sampleDir);
            return sampleDir;
        }

        private Dictionary<string, object> HandleOpenFolderDialog(string initialFolder)
        {
            string selected = NativeFolderPicker.ShowDialog(this.Handle, "Selecione a pasta com suas cifras (.txt)", initialFolder);
            if (string.IsNullOrWhiteSpace(selected) || !Directory.Exists(selected))
            {
                return new Dictionary<string, object> { { "cancelled", true } };
            }
            return ScanDirectoryForTxt(selected);
        }

        private Dictionary<string, object> ScanDirectoryForTxt(string folderPath)
        {
            var filesList = new List<Dictionary<string, object>>();
            if (!string.IsNullOrWhiteSpace(folderPath) && Directory.Exists(folderPath))
            {
                string[] allTxt = Directory.GetFiles(folderPath, "*.txt", SearchOption.AllDirectories);
                Array.Sort(allTxt, StringComparer.OrdinalIgnoreCase);

                foreach (string f in allTxt)
                {
                    string rel = f.StartsWith(folderPath, StringComparison.OrdinalIgnoreCase)
                        ? f.Substring(folderPath.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                        : Path.GetFileName(f);

                    filesList.Add(new Dictionary<string, object>
                    {
                        { "name", Path.GetFileName(f) },
                        { "relativePath", rel },
                        { "fullPath", f }
                    });
                }
            }

            return new Dictionary<string, object>
            {
                { "cancelled", false },
                { "folderPath", folderPath },
                { "files", filesList }
            };
        }

        private object HandleCreateTextFile(Dictionary<string, object> payload)
        {
            string folder = Convert.ToString(payload["folderPath"]);
            string fileName = Convert.ToString(payload["fileName"]);
            string content = Convert.ToString(payload["content"]);

            if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
            {
                folder = DetectDefaultMusicFolder();
            }

            foreach (char c in Path.GetInvalidFileNameChars())
            {
                fileName = fileName.Replace(c, '_');
            }
            if (!fileName.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
            {
                fileName += ".txt";
            }

            string fullPath = Path.Combine(folder, fileName);
            File.WriteAllText(fullPath, content, new UTF8Encoding(false));

            var scan = ScanDirectoryForTxt(folder);
            return new Dictionary<string, object>
            {
                { "success", true },
                { "createdFile", new Dictionary<string, object>
                    {
                        { "name", Path.GetFileName(fullPath) },
                        { "relativePath", Path.GetFileName(fullPath) },
                        { "fullPath", fullPath }
                    }
                },
                { "files", scan["files"] }
            };
        }

        private static string ReadTextSmartEncoding(string path)
        {
            byte[] bytes = File.ReadAllBytes(path);
            try
            {
                var utf8Strict = new UTF8Encoding(false, true);
                return utf8Strict.GetString(bytes);
            }
            catch
            {
                return Encoding.GetEncoding(1252).GetString(bytes);
            }
        }

        private Dictionary<string, object> LoadSettings()
        {
            try
            {
                if (File.Exists(this.settingsFilePath))
                {
                    string content = File.ReadAllText(this.settingsFilePath, Encoding.UTF8);
                    var data = json.Deserialize<Dictionary<string, object>>(content);
                    if (data != null) return data;
                }
            }
            catch { }
            return new Dictionary<string, object>();
        }

        private void SendResponse(string id, object result, string error)
        {
            if (string.IsNullOrEmpty(id) || webView == null || webView.CoreWebView2 == null) return;
            var envelope = new Dictionary<string, object>
            {
                { "id", id },
                { "result", result },
                { "error", error }
            };
            webView.CoreWebView2.PostWebMessageAsJson(json.Serialize(envelope));
        }

        [STAThread]
        public static void Main(string[] args)
        {
            bool selfTest = args != null && Array.Exists(args, a => a == "--self-test");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new CifraFlowForm(selfTest));
        }
    }

    /// <summary>
    /// Seletor Nativo Moderno do Windows Explorer (IFileOpenDialog com FOS_PICKFOLDERS)
    /// Idêntico ao Print 3 de referência ("Select folder" / "Cancelar").
    /// </summary>
    internal static class NativeFolderPicker
    {
        public static string ShowDialog(IntPtr ownerHandle, string title, string initialFolder)
        {
            IFileOpenDialog dialog = null;
            try
            {
                dialog = (IFileOpenDialog)new FileOpenDialogRCW();
                uint options;
                dialog.GetOptions(out options);
                dialog.SetOptions(options | 0x00000020 | 0x00000040); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
                dialog.SetTitle(title);

                if (!string.IsNullOrWhiteSpace(initialFolder) && Directory.Exists(initialFolder))
                {
                    Guid iidShellItem = typeof(IShellItem).GUID;
                    IShellItem folderItem;
                    if (SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, ref iidShellItem, out folderItem) == 0 && folderItem != null)
                    {
                        dialog.SetFolder(folderItem);
                    }
                }

                int hr = dialog.Show(ownerHandle);
                if (hr != 0) return null;

                IShellItem resultItem;
                dialog.GetResult(out resultItem);
                if (resultItem == null) return null;

                IntPtr pszString;
                resultItem.GetDisplayName(0x80058000, out pszString); // SIGDN_FILESYSPATH
                if (pszString == IntPtr.Zero) return null;

                string selectedPath = Marshal.PtrToStringAuto(pszString);
                Marshal.FreeCoTaskMem(pszString);
                return selectedPath;
            }
            catch
            {
                using (var fallback = new FolderBrowserDialog { Description = title, SelectedPath = initialFolder ?? "" })
                {
                    return fallback.ShowDialog() == DialogResult.OK ? fallback.SelectedPath : null;
                }
            }
            finally
            {
                if (dialog != null) Marshal.ReleaseComObject(dialog);
            }
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            ref Guid riid,
            [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv
        );

        [ComImport]
        [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
        private class FileOpenDialogRCW { }

        [ComImport]
        [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IFileOpenDialog
        {
            [PreserveSig] int Show([In] IntPtr parent);
            void SetFileTypes([In] uint cFileTypes, [In] IntPtr rgFilterSpec);
            void SetFileTypeIndex([In] uint iFileType);
            void GetFileTypeIndex(out uint piFileType);
            void Advise([In, MarshalAs(UnmanagedType.Interface)] IntPtr pfde, out uint pdwCookie);
            void Unadvise([In] uint dwCookie);
            void SetOptions([In] uint fos);
            void GetOptions(out uint pfos);
            void SetDefaultFolder([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi);
            void SetFolder([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi);
            void GetFolder([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void GetCurrentSelection([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void SetFileName([In, MarshalAs(UnmanagedType.LPWStr)] string pszName);
            void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
            void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
            void SetOkButtonLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszText);
            void SetFileNameLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
            void GetResult([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
        }

        [ComImport]
        [Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IShellItem
        {
            void BindToHandler([In] IntPtr pbc, [In] ref Guid bhid, [In] ref Guid riid, out IntPtr ppv);
            void GetParent([MarshalAs(UnmanagedType.Interface)] out IShellItem ppsi);
            void GetDisplayName([In] uint sigdnName, out IntPtr ppszName);
            void GetAttributes([In] uint sfgaoMask, out uint psfgaoAttribs);
            void Compare([In, MarshalAs(UnmanagedType.Interface)] IShellItem psi, [In] uint hint, out int piOrder);
        }
    }
}
