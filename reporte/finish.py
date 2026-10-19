# Envuelve el índice en un campo TOC real (Word lo puede actualizar) y calcula páginas.
import re, sys, zipfile, shutil, subprocess, json, os
src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src); xml = z.read('word/document.xml').decode('utf8')
paras = [m for m in re.finditer(r'<w:p>(?:(?!</w:p>).)*?<w:pStyle w:val="TOC1"/>.*?</w:p>', xml)]
first, last = paras[0], paras[-1]
begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
lp = xml[last.start():last.end()]; lp2 = lp[:-6] + end + '</w:p>'
xml = xml[:last.start()] + lp2 + xml[last.end():]
fp = xml[first.start():first.end()]; i = fp.index('</w:pPr>') + 8
xml = xml[:first.start()] + fp[:i] + begin + fp[i:] + xml[first.end():]
out = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for it in z.infolist():
    out.writestr(it, xml.encode('utf8') if it.filename == 'word/document.xml' else z.read(it.filename))
out.close()
