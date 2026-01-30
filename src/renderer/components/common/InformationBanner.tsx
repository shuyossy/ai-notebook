import React, { useEffect } from 'react';
import { Box, Alert, Stack, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoIcon from '@mui/icons-material/Info';
import { useInformationStore } from '../../stores/informationStore';
import { InformationApi } from '../../service/informationApi';

/**
 * お知らせバナーコンポーネント
 * アプリ起動時にお知らせを取得し、メインコンテンツエリアの上部に表示する
 */
const InformationBanner: React.FC = () => {
  const informations = useInformationStore((state) => state.informations);
  const loaded = useInformationStore((state) => state.loaded);
  const setInformations = useInformationStore((state) => state.setInformations);
  const removeInformation = useInformationStore(
    (state) => state.removeInformation,
  );

  useEffect(() => {
    // 一度だけ読み込み
    if (!loaded) {
      const fetchInformations = async () => {
        const api = InformationApi.getInstance();
        const result = await api.getInformations({
          showAlert: false,
          throwError: false,
        });
        if (result) {
          setInformations(result);
        } else {
          // エラー時も読み込み済みとしてマーク
          setInformations([]);
        }
      };
      fetchInformations();
    }
  }, [loaded, setInformations]);

  // お知らせがない場合は何も表示しない
  if (informations.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        width: '100%',
        flexShrink: 0, // メインコンテンツに押しつぶされないようにする
      }}
    >
      <Stack>
        {informations.map((info) => (
          <Alert
            key={info.id}
            severity="info"
            icon={<InfoIcon fontSize="small" />}
            action={
              <IconButton
                aria-label="close"
                color="inherit"
                size="small"
                onClick={() => removeInformation(info.id)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            }
            sx={{
              py: 0.5,
              borderRadius: 0, // 角を直角に
              borderBottom: '1px solid rgba(0, 0, 0, 0.12)', // 下部に区切り線
              '& .MuiAlert-message': {
                py: 0,
              },
              '& .MuiAlert-icon': {
                py: 0.5,
              },
              '& .MuiAlert-action': {
                py: 0,
                alignItems: 'flex-start',
              },
            }}
          >
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-line', // 改行を反映
                wordBreak: 'break-word',
              }}
            >
              {info.message}
            </Typography>
          </Alert>
        ))}
      </Stack>
    </Box>
  );
};

export default InformationBanner;
