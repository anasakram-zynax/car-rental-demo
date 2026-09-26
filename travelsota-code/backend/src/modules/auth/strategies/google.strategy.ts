import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { AppConfigService } from '../../../shared/config/app-config.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(configService: AppConfigService) {
    const callbackUrl =
      process.env.GOOGLE_CALLBACK_URL ??
      `http://localhost:${process.env.PORT ?? 4000}/api/v1/auth/google/callback`;

    super({
      clientID: configService.auth.googleClientId,
      clientSecret: configService.auth.googleClientSecret,
      callbackURL: callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { id: googleId, emails, name, photos } = profile;

    const email = emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no email'), undefined);
      return;
    }

    this.logger.log(`Google OAuth callback for email=${email}`);

    done(null, {
      googleId,
      email,
      firstName: name?.givenName ?? null,
      lastName: name?.familyName ?? null,
      avatarUrl: photos?.[0]?.value ?? null,
    });
  }
}
