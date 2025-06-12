import React from 'react';
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  InputBase,
  Typography,
} from '@mui/material';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../../main/types';
import useAgentStatus from '../../hooks/useAgentStatus';

interface SidebarHeaderProps {}

const FEATURES = [
  { value: ROUTES.CHAT, label: 'チャット', icon: <ChatOutlinedIcon /> },
  {
    value: ROUTES.REVIEW,
    label: 'ドキュメントレビュー',
    icon: <ChecklistOutlinedIcon />,
  },
] as const;

const SidebarHeader: React.FC<SidebarHeaderProps> = () => {
  const { status } = useAgentStatus();
  const navigate = useNavigate();
  const location = useLocation();

  // 現在の機能を取得
  const getCurrentFeature = () => {
    if (location.pathname.startsWith(ROUTES.REVIEW)) {
      return ROUTES.REVIEW;
    }
    return ROUTES.CHAT;
  };

  // 機能切り替えハンドラ
  const handleFeatureChange = (event: SelectChangeEvent<string>) => {
    console.log('機能切り替え:', event.target.value);
    navigate(event.target.value);
  };

  return (
    <Stack spacing={2} sx={{ py: 1, px: 2, pt: 2, pb: 0 }}>
      <Box>
        <FormControl variant="standard" size="small">
          <Select
            value={getCurrentFeature()}
            onChange={handleFeatureChange}
            displayEmpty
            disabled={status.state !== 'ready'}
            input={
              <InputBase
                sx={{ '&:before, &:after': { borderBottom: 'none' } }}
              />
            }
            sx={{
              borderRadius: 2,
            }}
          >
            {FEATURES.map((feature) => (
              <MenuItem key={feature.value} value={feature.value}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.2,
                  }}
                >
                  {feature.icon}
                  <Typography>{feature.label}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Stack>
  );
};

export default SidebarHeader;
