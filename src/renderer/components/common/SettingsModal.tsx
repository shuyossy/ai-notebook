import React, { useState, useMemo } from 'react';
import {
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import Modal from './Modal';
import { Settings } from '../../types';
import { useElectronStore } from '../../hooks/useElectronStore';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsUpdated: () => void;
}

function SettingsModal({
  open,
  onClose,
  onSettingsUpdated,
}: SettingsModalProps) {
  const [database, setDatabase] = useElectronStore<{ dir: string }>('database');
  const [source, setSource] = useElectronStore<{ registerDir: string }>(
    'source',
  );
  type ApiSettings = {
    key: string;
    url: string;
    model: string;
  };
  const [api, setApi] = useElectronStore<ApiSettings>('api');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 設定を結合
  const settings = useMemo<Settings>(
    () => ({
      database: database ?? { dir: '' },
      source: source ?? { registerDir: './source' },
      api: api ?? { key: '', url: '', model: '' },
    }),
    [database, source, api],
  );

  // 設定を更新する
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await Promise.all([
        setDatabase(settings.database),
        setSource(settings.source),
        setApi(settings.api),
      ]);
      onSettingsUpdated();
      onClose();
    } catch (err) {
      setError(`設定の更新に失敗しました: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // フィールド更新ハンドラ
  const handleChange = (
    section: keyof Settings,
    field: string,
    value: string,
  ) => {
    switch (section) {
      case 'database':
        setDatabase({ ...database, [field]: value } as { dir: string });
        break;
      case 'source':
        setSource({ ...source, [field]: value } as { registerDir: string });
        break;
      case 'api':
        setApi({ ...api, [field]: value } as ApiSettings);
        break;
      default:
        console.warn(`Unknown section: ${section}`);
    }
  };

  // モーダルのアクションボタン
  const actions = (
    <>
      <Button onClick={onClose} disabled={saving}>
        キャンセル
      </Button>
      <Button
        onClick={handleSave}
        variant="contained"
        color="primary"
        disabled={saving}
        startIcon={saving ? <CircularProgress size={16} /> : null}
      >
        保存
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="設定" actions={actions}>
      {error && (
        <Typography color="error" sx={{ p: 2 }}>
          {error}
        </Typography>
      )}
      <Box sx={{ flexGrow: 1 }}>
        <Grid container spacing={3}>
          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              データベース設定
            </Typography>
            <TextField
              fullWidth
              label="データベースパス"
              value={settings.database.dir}
              onChange={(e) => handleChange('database', 'dir', e.target.value)}
              margin="normal"
              variant="outlined"
            />
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              ソース設定
            </Typography>
            <TextField
              fullWidth
              label="ソース登録ディレクトリ"
              value={settings.source.registerDir}
              onChange={(e) =>
                handleChange('source', 'registerDir', e.target.value)
              }
              margin="normal"
              variant="outlined"
            />
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              API設定
            </Typography>
            <TextField
              fullWidth
              label="APIキー"
              value={settings.api.key}
              onChange={(e) => handleChange('api', 'key', e.target.value)}
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="APIエンドポイントURL"
              value={settings.api.url}
              onChange={(e) => handleChange('api', 'url', e.target.value)}
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="モデル名"
              value={settings.api.model}
              onChange={(e) => handleChange('api', 'model', e.target.value)}
              margin="normal"
              variant="outlined"
            />
          </Box>
        </Grid>
      </Box>
    </Modal>
  );
}

export default SettingsModal;
