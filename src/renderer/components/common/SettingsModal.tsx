import React, { useState, useEffect } from 'react';
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
import { settingsService } from '../../services/settingsService';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsUpdated: (settings: Settings) => void;
}

function SettingsModal({
  open,
  onClose,
  onSettingsUpdated,
}: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 設定を読み込む
  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      settingsService
        .getSettings()
        .then((data) => {
          setSettings(data);
          setLoading(false);
          return data;
        })
        .catch((err) => {
          setError(`設定の読み込みに失敗しました: ${err.message}`);
          setLoading(false);
        });
    }
  }, [open]);

  // 設定を更新する
  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);

    try {
      const result = await settingsService.updateSettings(settings);
      if (result.success) {
        onSettingsUpdated(settings);
        onClose();
      } else {
        setError(result.message || '設定の更新に失敗しました');
      }
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
    if (!settings) return;

    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [field]: value,
      },
    });
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
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}
      {error && (
        <Typography color="error" sx={{ p: 2 }}>
          {error}
        </Typography>
      )}
      {settings && (
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
                onChange={(e) =>
                  handleChange('database', 'dir', e.target.value)
                }
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
      )}
    </Modal>
  );
}

export default SettingsModal;
