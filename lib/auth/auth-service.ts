import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { ApiError, AuthenticationError, AuthorizationError } from '../middleware/error-handler';

export interface User {
  id: string;
  walletAddress: string;
  role: 'user' | 'admin' | 'moderator';
  verified: boolean;
  createdAt: Date;
  lastActive: Date;
}

export interface AuthContext {
  user: User;
  permissions: string[];
  sessionId: string;
}

class AuthService {
  private readonly JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars'
  );
  private readonly JWT_EXPIRY = '24h';

  /**
   * Generate JWT token for authenticated user
   */
  async generateToken(user: User): Promise<string> {
    const payload = {
      sub: user.id,
      wallet: user.walletAddress,
      role: user.role,
      verified: user.verified,
      sessionId: this.generateSessionId(),
    };

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.JWT_EXPIRY)
      .sign(this.JWT_SECRET);
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.JWT_SECRET);
      
      const user: User = {
        id: payload.sub as string,
        walletAddress: payload.wallet as string,
        role: payload.role as 'user' | 'admin' | 'moderator',
        verified: payload.verified as boolean,
        createdAt: new Date(), // Would be fetched from DB in real implementation
        lastActive: new Date(),
      };

      const permissions = this.getUserPermissions(user.role);
      
      return {
        user,
        permissions,
        sessionId: payload.sessionId as string,
      };
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  /**
   * Extract token from request headers
   */
  extractToken(req: NextRequest): string {
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      throw new AuthenticationError('Authorization header missing');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Invalid authorization format. Use: Bearer <token>');
    }

    return authHeader.slice(7); // Remove 'Bearer ' prefix
  }

  /**
   * Verify wallet signature for authentication
   */
  async verifyWalletSignature(
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    // This would integrate with Solana wallet verification
    // For now, this is a placeholder
    try {
      // In real implementation:
      // 1. Verify the signature using Solana web3.js
      // 2. Check message format and timestamp
      // 3. Prevent replay attacks
      
      console.log('Verifying wallet signature:', { walletAddress, signature, message });
      
      // Placeholder verification (replace with actual Solana signature verification)
      return signature.length > 50 && walletAddress.length === 44;
    } catch (error) {
      console.error('Wallet signature verification failed:', error);
      return false;
    }
  }

  /**
   * Get user permissions based on role
   */
  private getUserPermissions(role: string): string[] {
    const permissions: Record<string, string[]> = {
      admin: [
        'takeover:create',
        'takeover:edit',
        'takeover:delete',
        'takeover:finalize',
        'user:manage',
        'system:admin'
      ],
      moderator: [
        'takeover:create',
        'takeover:edit',
        'takeover:finalize',
        'user:moderate'
      ],
      user: [
        'takeover:create',
        'takeover:participate',
        'profile:edit'
      ]
    };

    return permissions[role] || permissions.user;
  }

  /**
   * Check if user has required permissions
   */
  hasPermission(authContext: AuthContext, requiredPermission: string): boolean {
    return authContext.permissions.includes(requiredPermission);
  }

  /**
   * Check if user has any of the required permissions
   */
  hasAnyPermission(authContext: AuthContext, requiredPermissions: string[]): boolean {
    return requiredPermissions.some(permission => 
      authContext.permissions.includes(permission)
    );
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Authenticate user with wallet
   */
  async authenticateWallet(walletAddress: string, signature: string, message: string): Promise<User> {
    // Verify wallet signature
    const isValidSignature = await this.verifyWalletSignature(walletAddress, signature, message);
    
    if (!isValidSignature) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    // In real implementation, fetch/create user from database
    const user: User = {
      id: `user_${walletAddress.slice(0, 8)}`,
      walletAddress,
      role: 'user',
      verified: true,
      createdAt: new Date(),
      lastActive: new Date(),
    };

    return user;
  }
}

export const authService = new AuthService();

// Enhanced middleware with proper authentication
export function withAuth(requiredPermissions: string[] = []) {
  return function<T = any>(
    handler: (req: NextRequest, context: any & { auth: AuthContext }) => Promise<T>
  ) {
    return async (req: NextRequest, context?: any): Promise<T> => {
      try {
        // Extract and verify token
        const token = authService.extractToken(req);
        const authContext = await authService.verifyToken(token);

        // Check permissions if required
        if (requiredPermissions.length > 0) {
          const hasPermission = authService.hasAnyPermission(authContext, requiredPermissions);
          
          if (!hasPermission) {
            throw new AuthorizationError(
              `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`
            );
          }
        }

        // Add auth context to request context
        const enhancedContext = {
          ...context,
          auth: authContext,
        };

        return handler(req, enhancedContext);
      } catch (error: unknown) {
        if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
          throw error;
        }
        
        // Wrap unexpected auth errors
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
        throw new AuthenticationError(errorMessage);
      }
    };
  };
}

// Optional authentication (doesn't throw if no token)
export function withOptionalAuth<T = any>(
  handler: (req: NextRequest, context: any & { auth?: AuthContext }) => Promise<T>
) {
  return async (req: NextRequest, context?: any): Promise<T> => {
    let authContext: AuthContext | undefined;

    try {
      const token = authService.extractToken(req);
      authContext = await authService.verifyToken(token);
    } catch (error: unknown) {
      // Silently ignore authentication errors for optional auth
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
      console.log('Optional auth failed (expected for public endpoints):', errorMessage);
    }

    const enhancedContext = {
      ...context,
      auth: authContext,
    };

    return handler(req, enhancedContext);
  };
}