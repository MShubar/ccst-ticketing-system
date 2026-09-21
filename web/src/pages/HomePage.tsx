import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { useAuthStore } from "@/store/auth/authStore";
import { fetchCurriculumApi } from "@/services/queries/auth/auth.api";
import { Card, Hint, Btn } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { colors } from "@/theme/colors";

const Shell = styled.div`
  min-height: 100vh;
  background: #07131f;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  color: #d4e0eb;
`;

const LevelBadge = styled.div`
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #1a2e3f;
  border: 3px solid ${colors.teal};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 700;
  color: ${colors.teal};
  margin-bottom: 24px;
  flex-shrink: 0;
`;

const Title = styled.h1`
  font-size: 30px;
  font-weight: 700;
  margin: 0 0 8px;
  color: #ffffff;
  text-align: center;
`;

const Sub = styled.p`
  color: ${colors.muted};
  margin: 0 0 32px;
  text-align: center;
  max-width: 480px;
  line-height: 1.6;
`;

const SkillItem = styled.div`
  padding: 12px 16px;
  background: #0e1a26;
  border-left: 3px solid ${colors.teal};
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.5;
  color: #c8d6e5;
  width: 100%;
  max-width: 480px;
`;

const NextCard = styled(Card)`
  width: 100%;
  max-width: 480px;
  text-align: center;
  margin-top: 16px;
`;

const Footer = styled.div`
  margin-top: 32px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
`;

type CurriculumEntry = { level: number; title: string; description: string };

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [curriculum, setCurriculum] = useState<CurriculumEntry[]>([]);

  useEffect(() => {
    fetchCurriculumApi()
      .then(setCurriculum)
      .catch(() => {});
  }, []);

  const currentLevel = user?.level || 1;
  const entry = curriculum.find((c) => c.level === currentLevel);
  const nextEntry = curriculum.find((c) => c.level === currentLevel + 1);

  return (
    <Shell>
      <LevelBadge>L{currentLevel}</LevelBadge>

      <Title>Level {currentLevel}</Title>
      <Sub>
        {entry?.title || "Your current level"}
      </Sub>

      {entry && (
        <SkillItem>
          <strong>What you're learning:</strong> {entry.description}
        </SkillItem>
      )}

      {nextEntry && (
        <>
          <SkillItem style={{ borderLeftColor: colors.muted, opacity: 0.6 }}>
            <strong>Next: Level {nextEntry.level} - {nextEntry.title}</strong>
          </SkillItem>
          <NextCard>
            <Hint style={{ marginBottom: 8 }}>Coming up next</Hint>
            <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.5 }}>
              {nextEntry.description}
            </p>
          </NextCard>
        </>
      )}

      <Footer>
        <Btn onClick={() => navigate(ROUTES.DASHBOARD)} $variant="teal">
          Go to Dashboard
        </Btn>
        <Btn onClick={() => navigate(ROUTES.TICKETS)} $variant="secondary">
          View Tickets
        </Btn>
      </Footer>
    </Shell>
  );
}
