import { ErrorText } from "@/components/ui/primitives";

type FormErrorProps = {
  message?: string;
};

export default function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return <ErrorText role="alert">{message}</ErrorText>;
}
