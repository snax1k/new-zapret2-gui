using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class IconGenerator
{
    static void Main()
    {
        int[] sizes = new int[] { 16, 32, 48, 64, 128, 256 };
        Bitmap[] bitmaps = new Bitmap[sizes.Length];

        for (int i = 0; i < sizes.Length; i++)
        {
            int size = sizes[i];
            Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.Clear(Color.Transparent);

                float pad = size * 0.08f;
                float w = size - (pad * 2);
                float h = size - (pad * 2);

                // Draw Shield path
                using (GraphicsPath shieldPath = new GraphicsPath())
                {
                    shieldPath.AddLine(pad + w * 0.5f, pad, pad + w, pad + h * 0.25f);
                    shieldPath.AddLine(pad + w, pad + h * 0.25f, pad + w * 0.85f, pad + h * 0.75f);
                    shieldPath.AddLine(pad + w * 0.85f, pad + h * 0.75f, pad + w * 0.5f, pad + h);
                    shieldPath.AddLine(pad + w * 0.5f, pad + h, pad + w * 0.15f, pad + h * 0.75f);
                    shieldPath.AddLine(pad + w * 0.15f, pad + h * 0.75f, pad, pad + h * 0.25f);
                    shieldPath.CloseFigure();

                    // Gradient fill (Indigo to Deep Purple)
                    using (LinearGradientBrush brush = new LinearGradientBrush(
                        new PointF(0, 0), new PointF(size, size),
                        Color.FromArgb(255, 99, 102, 241), Color.FromArgb(255, 67, 56, 202)))
                    {
                        g.FillPath(brush, shieldPath);
                    }

                    // Border
                    using (Pen pen = new Pen(Color.FromArgb(255, 129, 140, 248), size * 0.04f))
                    {
                        g.DrawPath(pen, shieldPath);
                    }
                }

                // Draw Lightning Bolt inside shield
                using (GraphicsPath boltPath = new GraphicsPath())
                {
                    boltPath.AddPolygon(new PointF[] {
                        new PointF(pad + w * 0.55f, pad + h * 0.22f),
                        new PointF(pad + w * 0.35f, pad + h * 0.52f),
                        new PointF(pad + w * 0.52f, pad + h * 0.52f),
                        new PointF(pad + w * 0.42f, pad + h * 0.80f),
                        new PointF(pad + w * 0.68f, pad + h * 0.45f),
                        new PointF(pad + w * 0.50f, pad + h * 0.45f)
                    });

                    // Emerald glow fill for lightning
                    using (LinearGradientBrush boltBrush = new LinearGradientBrush(
                        new PointF(0, 0), new PointF(0, size),
                        Color.FromArgb(255, 52, 211, 153), Color.FromArgb(255, 16, 185, 129)))
                    {
                        g.FillPath(boltBrush, boltPath);
                    }
                }
            }
            bitmaps[i] = bmp;
        }

        SaveAsIco(bitmaps, "app.ico");
        bitmaps[bitmaps.Length - 1].Save("public\\shield.png", ImageFormat.Png);
        Console.WriteLine("app.ico successfully generated with multi-resolution layers!");
    }

    static void SaveAsIco(Bitmap[] bitmaps, string outputPath)
    {
        using (FileStream fs = new FileStream(outputPath, FileMode.Create))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            // ICONHEADER
            bw.Write((ushort)0);      // Reserved
            bw.Write((ushort)1);      // Type 1 = ICO
            bw.Write((ushort)bitmaps.Length); // Image count

            int offset = 6 + (16 * bitmaps.Length);
            byte[][] pngBytes = new byte[bitmaps.Length][];

            for (int i = 0; i < bitmaps.Length; i++)
            {
                using (MemoryStream ms = new MemoryStream())
                {
                    bitmaps[i].Save(ms, ImageFormat.Png);
                    pngBytes[i] = ms.ToArray();
                }
            }

            for (int i = 0; i < bitmaps.Length; i++)
            {
                Bitmap b = bitmaps[i];
                bw.Write((byte)(b.Width >= 256 ? 0 : b.Width));
                bw.Write((byte)(b.Height >= 256 ? 0 : b.Height));
                bw.Write((byte)0);    // Palette colors (0 = no palette)
                bw.Write((byte)0);    // Reserved
                bw.Write((ushort)1);  // Color planes
                bw.Write((ushort)32); // Bits per pixel
                bw.Write((uint)pngBytes[i].Length); // Size of image data
                bw.Write((uint)offset);             // Offset of image data
                offset += pngBytes[i].Length;
            }

            for (int i = 0; i < bitmaps.Length; i++)
            {
                bw.Write(pngBytes[i]);
            }
        }
    }
}
