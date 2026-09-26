'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from './input';
import { Select } from './select';

interface FormFieldBaseProps {
  name: string;
  label?: string;
  helperText?: string;
}

interface InputFieldProps extends FormFieldBaseProps {
  type?: 'input';
  placeholder?: string;
}

interface SelectFieldProps extends FormFieldBaseProps {
  type: 'select';
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
}

type FormFieldProps = InputFieldProps | SelectFieldProps;

export function FormField(props: FormFieldProps) {
  const { name, label, helperText } = props;
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const error = errors[name]?.message as string | undefined;

  if (props.type === 'select') {
    return (
      <Select
        label={label}
        error={error}
        helperText={helperText}
        placeholder={props.placeholder}
        options={props.options}
        {...register(name)}
      />
    );
  }

  return (
    <Input
      label={label}
      error={error}
      helperText={helperText}
      placeholder={props.placeholder}
      {...register(name)}
    />
  );
}
