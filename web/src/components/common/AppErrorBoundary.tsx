import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import styled from "styled-components";

import { Btn } from "@/components/ui/primitives";
import { colors } from "@/theme/colors";

const Root = styled.div`
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  background: ${colors.navy};
  color: ${colors.loginCopy};
  padding: 24px;
`;

const Panel = styled.div`
  text-align: center;

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
`;

const Reload = styled(Btn)`
  margin-top: 16px;
`;

function Fallback() {
  return (
    <Root>
      <Panel>
        <h1>Something went wrong</h1>
        <Reload type="button" $variant="teal" onClick={() => window.location.reload()}>
          Reload
        </Reload>
      </Panel>
    </Root>
  );
}

export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary FallbackComponent={Fallback}>{children}</ErrorBoundary>;
}
