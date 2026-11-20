import importlib.util
from pathlib import Path
import tempfile, unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('transfer_control',ROOT/'deploy/ovh/ci/transfer-control.py');control=importlib.util.module_from_spec(spec);spec.loader.exec_module(control)
class TransferControl(unittest.TestCase):
    def test_unmanaged_destination_is_refused(self):
        with self.assertRaisesRegex(ValueError,'Unexpected managed file'):
            control.verify_state({'files':{'/tmp/unmanaged':None}})
    def test_modified_backup_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'copy';source.write_text('changed')
            with patch.object(control,'trusted',lambda _:None), self.assertRaises(AssertionError):
                control.verify_state({'files':{str(control.PROMOTE):{'copy':str(source),'sha256':'a'*64}}})
    def test_failed_switch_restores_source_once(self):
        calls=[];saved=[]
        old={'name':'old'};new={'name':'new'};data={'active':'previous','previous':old,'current':new}
        def apply(state):
            calls.append(state['name'])
            if state is new:raise ValueError('health failed')
        with patch.object(control,'apply',apply),patch.object(control,'save_state',lambda state:saved.append(state.copy())):
            with self.assertRaisesRegex(ValueError,'health failed'):control.activate(data,'current')
        self.assertEqual(calls,['new','old']);self.assertEqual(saved[-1]['active'],'previous');self.assertIsNone(saved[-1]['pending'])
    def test_ci_user_cannot_use_administrator_switch(self):
        with patch.object(control.os,'geteuid',return_value=0),patch.dict(control.os.environ,{'SUDO_USER':'vidfetch-deploy'}):
            with self.assertRaisesRegex(SystemExit,'Administrator required'):control.main()
