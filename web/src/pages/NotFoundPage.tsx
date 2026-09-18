import { Link } from "react-router-dom";
import styled from "styled-components";

import { Card } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { colors } from "@/theme/colors";

const Root = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: ${colors.navy};
  padding: 24px;
`;

const Panel = styled(Card)`
  padding: 32px;
  text-align: center;
  max-width: 420px;

  h1 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.serif};
    font-size: 28px;
  }
`;

const Note = styled.p`
  margin: 8px 0 0;
  font-size: 12px;
  color: ${colors.muted};
`;

const DashLink = styled(Link)`
  display: inline-flex;
  margin-top: 16px;
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px 12px;
  font-weight: 600;
  background: ${colors.tealDeep};
  color: ${colors.white};
`;

export default function NotFoundPage() {
  return (
    <Root>
      <Panel>
        <h1>Page not found</h1>
        <Note>That route is not in the React app yet.</Note>
        <DashLink to={ROUTES.DASHBOARD}>Go to dashboard</DashLink>
      </Panel>
    </Root>
  );
}
