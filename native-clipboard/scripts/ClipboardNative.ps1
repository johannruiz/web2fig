Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ClipboardNative {
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool OpenClipboard(IntPtr hWndNewOwner);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool CloseClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint EnumClipboardFormats(uint format);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern int GetClipboardFormatName(uint format, StringBuilder lpszFormatName, int cchMaxCount);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr GetClipboardData(uint uFormat);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool EmptyClipboard();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr SetClipboardData(uint uFormat, IntPtr hMem);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint RegisterClipboardFormat(string lpszFormat);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalLock(IntPtr hMem);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GlobalUnlock(IntPtr hMem);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern UIntPtr GlobalSize(IntPtr hMem);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalAlloc(uint uFlags, UIntPtr dwBytes);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GlobalFree(IntPtr hMem);

  private const uint GMEM_MOVEABLE = 0x0002;

  public class ClipboardFormat {
    public uint Id { get; set; }
    public string Name { get; set; }
    public int Size { get; set; }
  }

  public static List<ClipboardFormat> ListFormats() {
    var result = new List<ClipboardFormat>();
    Open();
    try {
      uint current = 0;
      while ((current = EnumClipboardFormats(current)) != 0) {
        byte[] data = ReadFormatUnlocked(current);
        result.Add(new ClipboardFormat {
          Id = current,
          Name = FormatName(current),
          Size = data == null ? 0 : data.Length
        });
      }
      return result;
    } finally {
      CloseClipboard();
    }
  }

  public static byte[] ReadFormat(uint format) {
    Open();
    try {
      return ReadFormatUnlocked(format);
    } finally {
      CloseClipboard();
    }
  }

  public static void WriteFormats(string[] names, byte[][] payloads) {
    if (names.Length != payloads.Length) {
      throw new ArgumentException("Format and payload counts differ.");
    }

    Open();
    try {
      if (!EmptyClipboard()) {
        ThrowLastWin32("EmptyClipboard");
      }

      for (int i = 0; i < names.Length; i++) {
        uint format = ResolveFormat(names[i]);
        WriteFormatUnlocked(format, payloads[i]);
      }
    } finally {
      CloseClipboard();
    }
  }

  private static void Open() {
    if (!OpenClipboard(IntPtr.Zero)) {
      ThrowLastWin32("OpenClipboard");
    }
  }

  private static byte[] ReadFormatUnlocked(uint format) {
    IntPtr handle = GetClipboardData(format);
    if (handle == IntPtr.Zero) {
      return new byte[0];
    }

    UIntPtr sizePtr = GlobalSize(handle);
    int size = checked((int)sizePtr.ToUInt64());
    if (size == 0) {
      return new byte[0];
    }

    IntPtr pointer = GlobalLock(handle);
    if (pointer == IntPtr.Zero) {
      return new byte[0];
    }

    try {
      byte[] buffer = new byte[size];
      Marshal.Copy(pointer, buffer, 0, size);
      return buffer;
    } finally {
      GlobalUnlock(handle);
    }
  }

  private static void WriteFormatUnlocked(uint format, byte[] payload) {
    IntPtr handle = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)payload.Length);
    if (handle == IntPtr.Zero) {
      ThrowLastWin32("GlobalAlloc");
    }

    IntPtr pointer = GlobalLock(handle);
    if (pointer == IntPtr.Zero) {
      GlobalFree(handle);
      ThrowLastWin32("GlobalLock");
    }

    try {
      Marshal.Copy(payload, 0, pointer, payload.Length);
    } finally {
      GlobalUnlock(handle);
    }

    if (SetClipboardData(format, handle) == IntPtr.Zero) {
      GlobalFree(handle);
      ThrowLastWin32("SetClipboardData");
    }
  }

  private static uint ResolveFormat(string name) {
    uint parsed;
    if (UInt32.TryParse(name, out parsed)) {
      return parsed;
    }
    return RegisterClipboardFormat(name);
  }

  private static string FormatName(uint format) {
    switch (format) {
      case 1: return "CF_TEXT";
      case 2: return "CF_BITMAP";
      case 3: return "CF_METAFILEPICT";
      case 8: return "CF_DIB";
      case 13: return "CF_UNICODETEXT";
      case 15: return "CF_HDROP";
      case 17: return "CF_DIBV5";
    }

    var builder = new StringBuilder(256);
    int length = GetClipboardFormatName(format, builder, builder.Capacity);
    return length > 0 ? builder.ToString() : format.ToString();
  }

  private static void ThrowLastWin32(string api) {
    throw new InvalidOperationException(api + " failed. Win32=" + Marshal.GetLastWin32Error());
  }
}
"@
