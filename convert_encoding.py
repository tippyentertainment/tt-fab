import codecs
import sys
path = r'c:\fab-taskingtech\tt-fab\sidepanel.js'
# read as utf-16 (assumes BOM)
text = codecs.open(path, 'r', 'utf-16').read()
codecs.open(path, 'w', 'utf-8').write(text)
print('converted')
