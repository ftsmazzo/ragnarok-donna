/** Mesmas opções do modal de pagamento da comanda (OrderDrawer). */
export const PAYMENT_METHOD_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "pix_key", label: "PIX chave" },
  { value: "rede_link", label: "Link Rede" },
  { value: "infinity", label: "Maquininha Infinity" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
  { value: "transfer", label: "Transferência" },
  { value: "client_account", label: "Conta do cliente" },
  { value: "other", label: "Outro" },
] as const;

export function PaymentMethodSelect(props: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  id?: string;
}) {
  const { name = "method", value, defaultValue, onChange, required, id } = props;
  return (
    <select
      id={id}
      name={name}
      required={required}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      {PAYMENT_METHOD_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
