-- employees.pin_code has no application call site. Keep the compatibility
-- column for rollback/schema stability, but remove any residual plaintext data.

update public.employees
set pin_code = null
where pin_code is not null;
