import React, { useState, useMemo } from 'react';
import { z } from 'zod';
import {
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import Modal from './Modal';
import { StoreSchema as Settings } from '../../../main/store';
import { McpSchema, McpSchemaType } from '../../../main/types/schema';
import { useElectronStore } from '../../hooks/useElectronStore';

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
  const [redmine, setRedmine] = useElectronStore<{
    endpoint: string;
    apiKey: string;
  }>('redmine');
  const [gitlab, setGitlab] = useElectronStore<{
    endpoint: string;
    apiKey: string;
  }>('gitlab');
  const [mcp, setMcp] = useElectronStore<{ serverConfig: McpSchemaType }>(
    'mcp',
  );
  const [mcpServersText, setMcpServersText] = useState<string>(
    JSON.stringify(mcp?.serverConfig ?? {}, null, 2),
  );
  const [mcpValidationError, setMcpValidationError] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 設定を結合
  const settings = useMemo<Settings>(
    () => ({
      database: database ?? { dir: '' },
      source: source ?? { registerDir: './source' },
      api: api ?? { key: '', url: '', model: '' },
      redmine: redmine ?? { endpoint: '', apiKey: '' },
      gitlab: gitlab ?? { endpoint: '', apiKey: '' },
      mcp: mcp ?? { serverConfig: {} },
    }),
    [database, source, api, redmine, gitlab, mcp],
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
        setRedmine(settings.redmine),
        setGitlab(settings.gitlab),
        setMcp(settings.mcp),
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
    value: string | McpSchemaType,
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
      case 'redmine':
        setRedmine({ ...redmine, [field]: value });
        break;
      case 'gitlab':
        setGitlab({ ...gitlab, [field]: value });
        break;
      case 'mcp':
        setMcp({ serverConfig: value as McpSchemaType });
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
              margin="normal"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="APIキー"
              value={settings.gitlab.apiKey}
              onChange={(e) => handleChange('gitlab', 'apiKey', e.target.value)}
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
              value={mcpServersText}
              onChange={(e) => {
                setMcpServersText(e.target.value);
                // バリデーション実行
                try {
                  const newValue = McpSchema.parse(JSON.parse(e.target.value));
                  setMcpValidationError(null);
                  handleChange('mcp', 'serverConfig', newValue);
                } catch (err) {
                  if (err instanceof SyntaxError) {
                    setMcpValidationError('JSONの形式が不正です');
                  } else if (err instanceof z.ZodError) {
                    setMcpValidationError(
                      `MCPサーバー設定が不正です: ${err.errors
                        .map((validationError) => validationError.message)
                        .join(', ')}`,
                    );
                  } else {
                    setMcpValidationError('予期せぬエラーが発生しました');
                  }
                }
              }}
              margin="normal"
              variant="outlined"
              error={!!mcpValidationError}
              helperText={mcpValidationError}
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
        </Grid>
      </Box>
    </Modal>
  );
};

export default SettingsModal;
