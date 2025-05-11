import React from 'react';
import {
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import Modal from './Modal';
import { McpSchemaType } from '../../../main/types/schema';
import useSettingsStore from '../../hooks/useSettingsStore';
import { StoreSchema as Settings } from '../../../main/store';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsUpdated: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  onSettingsUpdated,
}) => {
  const {
    settings,
    validationErrors,
    error,
    updateField,
    saveSettings,
    isValid,
    saving,
  } = useSettingsStore();

  // 設定を更新する
  const handleSave = async () => {
    const success = await saveSettings();
    if (success) {
      onSettingsUpdated();
      onClose();
    }
  };

  // フィールド更新ハンドラ
  const handleChange = async (
    section: keyof Settings,
    field: string,
    value: string | McpSchemaType,
  ) => {
    await updateField(section, field, value);
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
        disabled={saving || !isValid}
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
              API設定
            </Typography>
            <TextField
              fullWidth
              label="APIキー"
              value={settings.api.key}
              onChange={(e) => handleChange('api', 'key', e.target.value)}
              error={!!validationErrors.api?.key}
              helperText={validationErrors.api?.key?.message}
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="APIエンドポイントURL"
              value={settings.api.url}
              onChange={(e) => handleChange('api', 'url', e.target.value)}
              error={!!validationErrors.api?.url}
              helperText={validationErrors.api?.url?.message}
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="モデル名"
              value={settings.api.model}
              onChange={(e) => handleChange('api', 'model', e.target.value)}
              error={!!validationErrors.api?.model}
              helperText={validationErrors.api?.model?.message}
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
              error={!!validationErrors.source?.registerDir}
              helperText={validationErrors.source?.registerDir?.message}
              margin="normal"
              variant="outlined"
            />
            <Alert severity="warning" sx={{ mt: 1 }}>
              設定を反映させるにはアプリのソースの再読み込みが必要です
            </Alert>
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              Redmine設定
            </Typography>
            <TextField
              fullWidth
              label="エンドポイント"
              value={settings.redmine.endpoint}
              onChange={(e) =>
                handleChange('redmine', 'endpoint', e.target.value)
              }
              error={!!validationErrors.redmine?.endpoint}
              helperText={validationErrors.redmine?.endpoint?.message}
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="APIキー"
              value={settings.redmine.apiKey}
              onChange={(e) =>
                handleChange('redmine', 'apiKey', e.target.value)
              }
              error={!!validationErrors.redmine?.apiKey}
              helperText={validationErrors.redmine?.apiKey?.message}
              margin="normal"
              variant="outlined"
            />
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              GitLab設定
            </Typography>
            <TextField
              fullWidth
              label="エンドポイント"
              value={settings.gitlab.endpoint}
              onChange={(e) =>
                handleChange('gitlab', 'endpoint', e.target.value)
              }
              error={!!validationErrors.gitlab?.endpoint}
              helperText={validationErrors.gitlab?.endpoint?.message}
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="APIキー"
              value={settings.gitlab.apiKey}
              onChange={(e) => handleChange('gitlab', 'apiKey', e.target.value)}
              error={!!validationErrors.gitlab?.apiKey}
              helperText={validationErrors.gitlab?.apiKey?.message}
              margin="normal"
              variant="outlined"
            />
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              MCPサーバー設定
            </Typography>
            <TextField
              fullWidth
              label="MCPサーバー設定（JSON）"
              multiline
              rows={4}
              value={settings.mcp.serverConfigText}
              onChange={(e) => {
                handleChange('mcp', 'serverConfigText', e.target.value);
              }}
              margin="normal"
              variant="outlined"
              error={!!validationErrors.mcp?.serverConfigText}
              helperText={validationErrors.mcp?.serverConfigText?.message}
            />
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
              設定例:
              <pre
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  padding: '8px',
                  borderRadius: '4px',
                }}
              >
                {JSON.stringify(
                  {
                    weather: {
                      command: 'npx',
                      args: ['tsx', 'weather.ts'],
                      env: {
                        API_KEY: 'your-api-key',
                      },
                    },
                  },
                  null,
                  2,
                )}
              </pre>
            </Typography>
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              データベース設定(チャット履歴やソース情報の保存先)
            </Typography>
            <TextField
              fullWidth
              label="データベースパス"
              value={settings.database.dir}
              onChange={(e) => handleChange('database', 'dir', e.target.value)}
              error={!!validationErrors.database?.dir}
              helperText={validationErrors.database?.dir?.message}
              margin="normal"
              variant="outlined"
            />
            <Alert severity="warning" sx={{ mt: 1 }}>
              設定を反映させるにはアプリの再起動が必要です
            </Alert>
          </Box>
        </Grid>
      </Box>
    </Modal>
  );
};

export default SettingsModal;
