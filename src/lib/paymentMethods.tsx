/** Mesmas opções do modal de pagamento da comanda (OrderDrawer). */
export const PAYMENT_METHOD_OPTIONS = [
  { value: "credit_visa_master", label: "Crédito Visa/Master" },
  { value: "credit_elo_amex", label: "Crédito Elo/Amex" },
  { value: "debit_visa_master", label: "Débito Visa/Master" },
  { value: "debit_elo_amex", label: "Débito Elo/Amex" },
  { value: "infinity_2_visa_master", label: "Infinity 2x Visa/Master" },
  { value: "infinity_3_visa_master", label: "Infinity 3x Visa/Master" },
  { value: "infinity_4_visa_master", label: "Infinity 4x Visa/Master" },
  { value: "infinity_2_elo_amex", label: "Infinity 2x Elo/Amex" },
  { value: "infinity_3_elo_amex", label: "Infinity 3x Elo/Amex" },
  { value: "infinity_4_elo_amex", label: "Infinity 4x Elo/Amex" },
  { value: "pix", label: "PIX" },
  { value: "cash", label: "Dinheiro" },
  { value: "rede_link", label: "Link de pagamento" },
  { value: "pix_key", label: "Chave PIX" },
  { value: "parceria", label: "Parceria" },
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
  includeClientAccount?: boolean;
}) {
  const {
    name = "method",
    value,
    defaultValue,
    onChange,
    required,
    id,
    includeClientAccount = false,
  } = props;
  const options = includeClientAccount
    ? PAYMENT_METHOD_OPTIONS
    : PAYMENT_METHOD_OPTIONS.filter((option) => option.value !== "client_account");
  return (
    <select
      id={id}
      name={name}
      required={required}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
