import React, { memo } from 'react';
import { Box, Alert } from '@mui/material';
import { useSettingsZustandStore } from '../../stores/settingsZustandStore';

export interface AlertMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error' | undefined;
  content: string;
}

interface AlertManagerProps {
  additionalAlerts?: AlertMessage[];
  closeAdditionalAlerts?: (id: string) => void;
  position?: 'top' | 'bottom';
}

const AlertManager: React.FC<AlertManagerProps> = memo(
  ({
    additionalAlerts,
    closeAdditionalAlerts,
    position = 'top',
  }: AlertManagerProps) => {
    const { status, closeMessage } = useSettingsZustandStore();

    return (
      <Box
        sx={{
          position: 'absolute',
          [position]: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'fit-content',
          maxWidth: '80%',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {status.messages?.map((message) => (
          <Alert
            key={message.id}
            severity={message.type}
            sx={{ whiteSpace: 'pre-line' }}
            onClose={() => closeMessage(message.id)}
          >
            {message.content}
          </Alert>
        ))}
        {additionalAlerts?.map((alert) => (
          <Alert
            key={alert.id}
            severity={alert.type}
            sx={{ whiteSpace: 'pre-line' }}
            onClose={() => closeAdditionalAlerts?.(alert.id)}
          >
            {alert.content}
          </Alert>
        ))}
      </Box>
    );
  },
);

export default AlertManager;
