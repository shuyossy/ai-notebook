import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Chip,
  Popover,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import {
  Send as SendIcon,
  StopCircleOutlined as StopIcon,
} from '@mui/icons-material';
import { useAlertStore } from '@/renderer/stores/alertStore';

/* ---------- 型定義 ---------- */

export interface ChecklistOption {
  id: number;
  content: string;
}

interface ChecklistMentionInputProps {
  handleSubmit: (e: React.FormEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  message: string;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
  onStop?: () => void;
  checklists: ChecklistOption[];
  selectedChecklistIds: number[];
  onChecklistSelect: (ids: number[]) => void;
}

const ChecklistMentionInput: React.FC<ChecklistMentionInputProps> = ({
  handleSubmit,
  handleInputChange,
  message,
  disabled = false,
  placeholder = 'メッセージを入力...',
  isStreaming = false,
  onStop,
  checklists,
  selectedChecklistIds,
  onChecklistSelect,
}) => {
  const [isComposing, setIsComposing] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionSearchText, setMentionSearchText] = useState('');
  const inputRef = useRef<HTMLDivElement>(null);
  const addAlert = useAlertStore((state) => state.addAlert);

  /* ---------- チェックリストオプション ---------- */
  const checklistOptions = useMemo(() => {
    return checklists.map((cl) => ({ id: cl.id, content: cl.content }));
  }, [checklists]);

  /* ---------- フィルタリングされたチェックリストオプション ---------- */
  const filteredOptions = useMemo(() => {
    if (!mentionSearchText) return checklistOptions;
    const lowerSearch = mentionSearchText.toLowerCase();
    return checklistOptions.filter((option) =>
      option.content.toLowerCase().includes(lowerSearch),
    );
  }, [checklistOptions, mentionSearchText]);

  /* ---------- @メンション検出 ---------- */
  const detectMention = useCallback((text: string) => {
    const atIndex = text.lastIndexOf('@');
    if (atIndex === -1) return null;

    // @が行の先頭にあるかチェック
    if (atIndex > 0) {
      const beforeAt = text[atIndex - 1];
      // @の直前が改行でない場合はnullを返す
      if (beforeAt !== '\n') return null;
    }

    // @以降の文字列を取得
    const afterAt = text.slice(atIndex + 1);
    // 空白や改行があれば@メンション終了とみなす
    if (/\s/.test(afterAt)) return null;

    return { atIndex, searchText: afterAt };
  }, []);

  /* ---------- 入力変更ハンドラ ---------- */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      handleInputChange(e);

      // @メンション検出
      const mention = detectMention(newValue);
      if (mention) {
        setShowMentionMenu(true);
        setMentionSearchText(mention.searchText);
      } else {
        setShowMentionMenu(false);
        setMentionSearchText('');
      }
    },
    [handleInputChange, detectMention],
  );

  /* ---------- チェックリスト選択ハンドラ ---------- */
  const handleChecklistSelect = useCallback(
    (checklist: ChecklistOption | null) => {
      if (!checklist) return;

      const mention = detectMention(message);
      if (!mention) return;

      // @検索文字列を削除
      const beforeAt = message.slice(0, mention.atIndex);
      const afterMention = message.slice(
        mention.atIndex + 1 + mention.searchText.length,
      );
      const newMessage = beforeAt + afterMention;

      // 入力値を更新
      const syntheticEvent = {
        target: { value: newMessage },
      } as React.ChangeEvent<HTMLInputElement>;
      handleInputChange(syntheticEvent);

      // 選択リストに追加（重複チェック）
      if (!selectedChecklistIds.includes(checklist.id)) {
        onChecklistSelect([...selectedChecklistIds, checklist.id]);
      }

      // メニューを閉じる
      setShowMentionMenu(false);
      setMentionSearchText('');
    },
    [
      message,
      detectMention,
      handleInputChange,
      selectedChecklistIds,
      onChecklistSelect,
    ],
  );

  /* ---------- 送信ハンドラ（バリデーション付き） ---------- */
  const handleSubmitWithValidation = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // チェックリストが一つも選択されていない場合は警告
      if (selectedChecklistIds.length === 0) {
        addAlert({
          message: '@でチェックリストを一つ以上選択してください',
          severity: 'warning',
        });
        return;
      }
      handleSubmit(e);
    },
    [selectedChecklistIds, handleSubmit, addAlert],
  );

  /* ---------- Enter キー送信（Shift+Enter で改行） ---------- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isComposing) {
      // @メンションメニューが表示されている場合は完全一致をチェック
      if (showMentionMenu && mentionSearchText) {
        const exactMatch = filteredOptions.find(
          (option) =>
            option.content.toLowerCase() === mentionSearchText.toLowerCase(),
        );
        if (exactMatch) {
          // 完全一致した場合は自動選択
          e.preventDefault();
          handleChecklistSelect(exactMatch);
          return;
        }
      }

      // Shift+Enterの場合は改行を許可（preventDefaultしない）
      if (!e.shiftKey) {
        e.preventDefault();
        handleSubmitWithValidation(e);
      }
    }
  };

  /* ---------- IME 制御 ---------- */
  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  /* ============================================================= */

  return (
    <Box sx={{ p: 2, width: '100%', mx: 'auto' }}>
      {/* 選択中のチェックリスト表示 */}
      {selectedChecklistIds.length > 0 && (
        <Box
          sx={{
            mb: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0.5,
            overflow: 'auto',
            maxHeight: 100,
            pb: 0.5,
          }}
        >
          {selectedChecklistIds.map((id) => {
            const checklist = checklists.find((cl) => cl.id === id);
            if (!checklist) return null;
            return (
              <Chip
                key={id}
                label={checklist.content}
                size="small"
                color="primary"
                variant="outlined"
                onDelete={() => {
                  onChecklistSelect(
                    selectedChecklistIds.filter((cid) => cid !== id),
                  );
                }}
              />
            );
          })}
        </Box>
      )}

      {/* 入力欄 ----------------------------------------------------------- */}
      <Paper
        component="form"
        onSubmit={handleSubmitWithValidation}
        elevation={3}
        sx={{
          p: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 2,
          position: 'relative',
        }}
      >
        {/* メインのテキストフィールド */}
        <TextField
          ref={inputRef}
          fullWidth
          multiline
          minRows={1}
          maxRows={6}
          placeholder={placeholder}
          variant="outlined"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          disabled={disabled}
          slotProps={{
            input: {
              sx: {
                p: 1,
                '& fieldset': { border: 'none' },
              },
              endAdornment: (
                <InputAdornment position="end">
                  {isStreaming ? (
                    <IconButton
                      color="primary"
                      onClick={onStop}
                      data-testid="review-chat-stop-button"
                    >
                      <StopIcon />
                    </IconButton>
                  ) : (
                    <IconButton
                      color="primary"
                      type="submit"
                      disabled={disabled || !message.trim()}
                      data-testid="review-chat-send-button"
                    >
                      <SendIcon />
                    </IconButton>
                  )}
                </InputAdornment>
              ),
            },
          }}
        />

        {/* @メンション選択メニュー */}
        <Popover
          open={showMentionMenu}
          anchorEl={inputRef.current}
          onClose={() => {
            setShowMentionMenu(false);
            setMentionSearchText('');
          }}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          disableAutoFocus
          disableEnforceFocus
          disableRestoreFocus
          slotProps={{
            paper: {
              sx: {
                maxHeight: 200,
                width: inputRef.current?.offsetWidth || 300,
                overflow: 'auto',
              },
            },
          }}
        >
          <List dense>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <ListItem key={option.id} disablePadding>
                  <ListItemButton
                    onClick={() => handleChecklistSelect(option)}
                    selected={selectedChecklistIds.includes(option.id)}
                  >
                    <ListItemText
                      primary={`@${option.content}`}
                      primaryTypographyProps={{
                        sx: {
                          fontWeight:
                            option.content.toLowerCase() ===
                            mentionSearchText.toLowerCase()
                              ? 'bold'
                              : 'normal',
                        },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))
            ) : (
              <ListItem>
                <ListItemText
                  primary="該当するチェックリストがありません"
                  sx={{ color: 'text.secondary', fontStyle: 'italic' }}
                />
              </ListItem>
            )}
          </List>
        </Popover>
      </Paper>
    </Box>
  );
};

export default ChecklistMentionInput;
