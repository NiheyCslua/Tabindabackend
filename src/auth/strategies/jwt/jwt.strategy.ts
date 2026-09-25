import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'ABSUFIHREDIUGHUIOTJNM0IENSIOPRFUIOWGMJRT932MRJK39UJUTNMI9HB',
    });
  }

  async validate(payload: any) {
    return payload; // attaches to req.user
  }
}