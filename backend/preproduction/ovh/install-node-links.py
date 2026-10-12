import os,pathlib
assert os.geteuid()==0
base=pathlib.Path('/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin')
for name in ['node','npm','npx']:
 target=pathlib.Path('/usr/local/bin',name)
 assert not os.path.lexists(target), 'Existing command: no overwrite'
 assert (base/name).exists()
for name in ['node','npm','npx']:
 pathlib.Path('/usr/local/bin',name).symlink_to(base/name)
print('Only new Node/npm/npx symlinks created; Debian system paths untouched.')
