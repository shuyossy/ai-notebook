import React, { useEffect } from 'react';
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
import useSettingsStore from '../../hooks/useSettings';
import { StoreSchema as Settings } from '../../../main/store';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsUpdated: () => void;
  onValidChange: (isValid: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  onSettingsUpdated,
  onValidChange,
}) => {
  const {
    settings,
    validationErrors,
    loading,
    saveError,
    updateField,
    saveSettings,
    isValid,
    saving,
  } = useSettingsStore();

  // isValidが変更されたらonValidChangeを呼び出す
  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

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
    value: unknown,
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
        disabled={loading || saving || !isValid}
        startIcon={saving ? <CircularProgress size={16} /> : null}
      >
        保存
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="設定" actions={actions}>
      {saveError && (
        <Typography color="error" sx={{ p: 2 }}>
          {saveError}
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
              disabled={loading || saving}
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
              disabled={loading || saving}
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
              disabled={loading || saving}
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
              label="ドキュメント格納フォルダ"
              value={settings.source.registerDir}
              disabled={loading || saving}
              onChange={(e) =>
                handleChange('source', 'registerDir', e.target.value)
              }
              error={!!validationErrors.source?.registerDir}
              helperText={validationErrors.source?.registerDir?.message}
              margin="normal"
              variant="outlined"
            />
            <Alert severity="warning" sx={{ mt: 1 }}>
              AIが参照するドキュメントを格納するフォルダです
              <br />
              設定を変更した場合は、添付アイコンからフォルダ内容を同期してください
            </Alert>
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              Redmine設定
            </Typography>
            <TextField
              fullWidth
              label="Redmineエンドポイント"
              value={settings.redmine.endpoint}
              disabled={loading || saving}
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
              label="RedmineAPIキー"
              value={settings.redmine.apiKey}
              disabled={loading || saving}
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
              label="GitLabエンドポイント"
              value={settings.gitlab.endpoint}
              disabled={loading || saving}
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
              label="GitLabAPIキー"
              value={settings.gitlab.apiKey}
              disabled={loading || saving}
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
              value={settings.mcp.serverConfig}
              disabled={loading || saving}
              onChange={(e) => {
                handleChange('mcp', 'serverConfig', e.target.value);
              }}
              margin="normal"
              variant="outlined"
              error={!!validationErrors.mcp?.serverConfig}
              helperText={validationErrors.mcp?.serverConfig?.message}
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
              システムプロンプト設定
            </Typography>
            <TextField
              fullWidth
              label="システムプロンプトのカスタマイズが可能です"
              value={settings.systemPrompt.content}
              disabled={loading || saving}
              onChange={(e) =>
                handleChange('systemPrompt', 'content', e.target.value)
              }
              error={!!validationErrors.systemPrompt?.content}
              helperText={validationErrors.systemPrompt?.content?.message}
              margin="normal"
              variant="outlined"
              multiline
              rows={6}
            />
          </Box>

          <Box sx={{ width: '100%', mb: 1 }}>
            <Typography variant="h6" gutterBottom>
              データベース設定(チャット履歴やソース情報の保存先)
            </Typography>
            <TextField
              fullWidth
              label="データベース保存フォルダ"
              value={settings.database.dir}
              disabled={loading || saving}
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
