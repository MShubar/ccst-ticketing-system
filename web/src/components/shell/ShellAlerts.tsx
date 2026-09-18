import { AlertBox } from "@/components/shell/shell.styles";

type Props = {
  storage?: string | null;
  announcement?: string | null;
};

export default function ShellAlerts({ storage, announcement }: Props) {
  return (
    <>
      {storage === "memory" ? (
        <AlertBox>
          <strong>Nothing is being saved.</strong> The server has no durable
          storage, so tickets and lab state live in memory only.
        </AlertBox>
      ) : null}
      {announcement ? (
        <AlertBox $variant="announce" role="status">
          <strong>Class note</strong>
          <span>{announcement}</span>
        </AlertBox>
      ) : null}
    </>
  );
}
