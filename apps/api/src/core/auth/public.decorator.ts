import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'academybee:public';

/** No session needed (sign-in, refresh, public context). CSRF/origin checks still apply. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
