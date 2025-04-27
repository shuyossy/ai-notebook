import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MessageItem from './MessageItem';
import { ChatMessage } from '../../../main/types';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ messages, loading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
      className="hidden-scrollbar"
    >
      {messages.map((m) => {
        // 'tool-call' パートだけを抽出
        const toolParts =
          m.parts?.filter((p) => p.type === 'tool-invocation') ?? [];

        return (
          <Box key={m.id} mb={2}>
            <MessageItem message={m} />

            {toolParts.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  ツール実行結果 ({toolParts.length})
                </AccordionSummary>
                <AccordionDetails>
                  {toolParts.map((part) => {
                    const ti = part.toolInvocation;
                    return (
                      <Box
                        key={ti.toolCallId}
                        mb={1}
                        p={1}
                        sx={{ bgcolor: 'grey.100', borderRadius: 1 }}
                      >
                        <Box component="pre" sx={{ margin: 0 }}>
                          Tool: {ti.toolName}
                          {'\n'}args: ({JSON.stringify(ti.args)})
                        </Box>
                      </Box>
                    );
                  })}
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        );
      })}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      <Box ref={bottomRef} />
    </Box>
  );
};

export default MessageList;
