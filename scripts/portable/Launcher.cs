// SPDX-License-Identifier: AGPL-3.0
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Launcher {
    const string PackageId = "PACKAGE_ID_PLACEHOLDER";
    const string FolderName = "FOLDER_NAME_PLACEHOLDER";
    [STAThread]
    static int Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string target = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), FolderName);
        bool extractOnly = args.Length == 1 && args[0] == "--extract-only";
        try {
            string key;
            using (var sha = SHA256.Create()) key = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(target.ToUpperInvariant()))).Replace("-", "");
            using (var mutex = new Mutex(false, "Local\\MusicFreeShare-" + key)) {
                bool acquired = false;
                try {
                    try { acquired = mutex.WaitOne(TimeSpan.FromMinutes(3)); }
                    catch (AbandonedMutexException) { acquired = true; }
                    if (!acquired) throw new IOException("另一个解压进程仍在运行，请稍后重试。");
                    if (extractOnly && !IsReady(target)) { if (Directory.Exists(target) || File.Exists(target)) throw new IOException("同名文件夹已存在，请移到另一个空文件夹后重试。"); Extract(target, delegate(int value) {}); }
                    if (!IsReady(target)) {
                        if (Directory.Exists(target) || File.Exists(target)) throw new IOException("旁边已经存在同名程序文件夹，但不是此分享包创建的。为保护其中的数据，请把本 EXE 移到另一个空文件夹后运行。");
                        Exception failure = null;
                        using (var form = new Form()) {
                            form.Text = "MusicFree · 首次解压";
                            form.Width = 490; form.Height = 145;
                            form.StartPosition = FormStartPosition.CenterScreen;
                            form.FormBorderStyle = FormBorderStyle.FixedDialog;
                            form.MaximizeBox = false; form.MinimizeBox = false; form.ControlBox = false;
                            var label = new Label { Left=20, Top=16, Width=440, Height=38, Text="正在解压修改版 MusicFree，完成后自动启动……\n程序与个人数据保存在本文件旁边。" };
                            var progress = new ProgressBar { Left=20, Top=62, Width=440, Height=22 };
                            form.Controls.Add(label); form.Controls.Add(progress);
                            form.Shown += delegate {
                                Task.Factory.StartNew(delegate {
                                    try { Extract(target, delegate(int value) { form.BeginInvoke((Action)delegate { progress.Value = value; }); }); }
                                    catch (Exception ex) { failure = ex; }
                                    finally { form.BeginInvoke((Action)delegate { form.Close(); }); }
                                });
                            };
                            Application.Run(form);
                        }
                        if (failure != null) throw failure;
                    }
                } finally { if (acquired) mutex.ReleaseMutex(); }
            }
            if (!extractOnly) {
                Process.Start(new ProcessStartInfo(Path.Combine(target, "MusicFree.exe")) { WorkingDirectory=target, UseShellExecute=true });
            }
            return 0;
        } catch (Exception ex) {
            MessageBox.Show("MusicFree 未能启动：\n\n" + ex.Message + "\n\n请把本 EXE 放在有足够空间、允许写入的本地文件夹（例如 D 盘）后重试。", "MusicFree", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    static bool IsReady(string target) {
        string marker = Path.Combine(target, ".musicfree-package");
        return File.Exists(marker) && File.ReadAllText(marker).Trim() == PackageId
            && File.Exists(Path.Combine(target, "MusicFree.exe"))
            && File.Exists(Path.Combine(target, "resources", "app", "portable-init.cjs"));
    }
    static void Extract(string target, Action<int> progress) {
        string stage = target + ".unpacking-" + Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(stage);
        try {
            string prefix = Path.GetFullPath(stage) + Path.DirectorySeparatorChar;
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("MusicFreePayload.zip"))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
                int done = 0;
                foreach (var entry in archive.Entries) {
                    string dest = Path.GetFullPath(Path.Combine(stage, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                    if (!dest.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("解压路径无效。");
                    if (entry.Name.Length == 0) Directory.CreateDirectory(dest);
                    else {
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        using (var input = entry.Open())
                        using (var output = new FileStream(dest, FileMode.CreateNew, FileAccess.Write)) input.CopyTo(output);
                    }
                    progress(++done * 100 / archive.Entries.Count);
                }
            }
            File.WriteAllText(Path.Combine(stage, ".musicfree-package"), PackageId, Encoding.ASCII);
            Directory.Move(stage, target);
        } catch {
            // Delete only the unique, newly created staging folder beside target.
            string expectedParent = Path.GetDirectoryName(Path.GetFullPath(target));
            if (Path.GetDirectoryName(Path.GetFullPath(stage)) == expectedParent && Path.GetFileName(stage).StartsWith(FolderName + ".unpacking-", StringComparison.Ordinal)) {
                try { Directory.Delete(stage, true); } catch { }
            }
            throw;
        }
    }
}
