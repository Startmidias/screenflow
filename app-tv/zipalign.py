"""zipalign mínimo: entradas sem compressão alinhadas em 4 bytes (.so em 4096)."""
import sys, zipfile, struct

def align(src, dst):
    zin = zipfile.ZipFile(src)
    out = open(dst, 'wb')
    central = []
    for info in zin.infolist():
        data = zin.read(info.filename)
        name = info.filename.encode('utf-8')
        comp = info.compress_type
        if comp == zipfile.ZIP_DEFLATED:
            import zlib
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            payload = c.compress(data) + c.flush()
        else:
            payload = data
        crc = zipfile.crc32(data) & 0xffffffff
        offset = out.tell()
        extra = b''
        if comp == zipfile.ZIP_STORED:
            boundary = 4096 if info.filename.endswith('.so') else 4
            pos = offset + 30 + len(name)
            pad = (boundary - (pos % boundary)) % boundary
            extra = b'\x00' * pad
        dt = info.date_time
        dosdate = ((dt[0]-1980) << 9) | (dt[1] << 5) | dt[2]
        dostime = (dt[3] << 11) | (dt[4] << 5) | (dt[5] // 2)
        out.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0x0800, comp, dostime, dosdate,
                              crc, len(payload), len(data), len(name), len(extra)))
        out.write(name); out.write(extra); out.write(payload)
        central.append((name, comp, dostime, dosdate, crc, len(payload), len(data), offset))
    cd_start = out.tell()
    for (name, comp, dostime, dosdate, crc, csize, usize, offset) in central:
        out.write(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0x0800, comp, dostime, dosdate,
                              crc, csize, usize, len(name), 0, 0, 0, 0, 0, offset))
        out.write(name)
    cd_end = out.tell()
    out.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(central), len(central),
                          cd_end - cd_start, cd_start, 0))
    out.close()

def check(path):
    z = zipfile.ZipFile(path); bad = []
    f = open(path, 'rb')
    for i in z.infolist():
        if i.compress_type == zipfile.ZIP_STORED:
            f.seek(i.header_offset); h = f.read(30)
            n, e = struct.unpack('<HH', h[26:30])
            start = i.header_offset + 30 + n + e
            b = 4096 if i.filename.endswith('.so') else 4
            if start % b: bad.append(i.filename)
    return bad

if __name__ == '__main__':
    align(sys.argv[1], sys.argv[2])
    bad = check(sys.argv[2])
    print('alinhamento OK' if not bad else 'NÃO alinhados: %s' % bad)
