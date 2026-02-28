"""
Utility script for Exam Invigilation Reporting System
"""

import secrets
import sys


def generate_api_key(length=32):
    """Generate a secure random API key"""
    api_key = secrets.token_urlsafe(length)
    return api_key


def display_menu():
    """Display utility menu"""
    print("\n" + "=" * 50)
    print("Exam Invigilation System - Utility Script")
    print("=" * 50)
    print("\n1. Generate API Key")
    print("2. Check Configuration")
    print("3. Test Google Apps Script Connection")
    print("4. Exit")
    print("\n" + "=" * 50)


def check_configuration():
    """Check if configuration is properly set"""
    try:
        from config import settings
        
        print("\n" + "=" * 50)
        print("Configuration Check")
        print("=" * 50)
        
        print(f"\n✓ App Name: {settings.APP_NAME}")
        print(f"✓ Version: {settings.VERSION}")
        print(f"✓ Debug Mode: {settings.DEBUG}")
        print(f"✓ Host: {settings.HOST}")
        print(f"✓ Port: {settings.PORT}")
        
        # Check Google Apps Script URL
        if "YOUR_SCRIPT_ID" in settings.GOOGLE_APPS_SCRIPT_URL:
            print(f"\n⚠ Google Apps Script URL: NOT CONFIGURED")
            print(f"  Current: {settings.GOOGLE_APPS_SCRIPT_URL}")
            print(f"  Action: Update GOOGLE_APPS_SCRIPT_URL in .env file")
        else:
            print(f"\n✓ Google Apps Script URL: Configured")
        
        # Check API Key
        if "your-secret-api-key-here" in settings.GOOGLE_APPS_SCRIPT_API_KEY:
            print(f"⚠ API Key: NOT CONFIGURED")
            print(f"  Action: Update GOOGLE_APPS_SCRIPT_API_KEY in .env file")
        else:
            print(f"✓ API Key: Configured")
        
        print(f"\n✓ CORS Origins: {len(settings.CORS_ORIGINS)} configured")
        
        print("\n" + "=" * 50)
        
    except ImportError as e:
        print(f"\n✗ Error: Could not import config.py")
        print(f"  Make sure you're in the backend directory")
        print(f"  Error details: {str(e)}")
    except Exception as e:
        print(f"\n✗ Configuration Error: {str(e)}")


def test_google_connection():
    """Test connection to Google Apps Script"""
    try:
        import httpx
        import asyncio
        from config import settings
        
        async def test_connection():
            print("\n" + "=" * 50)
            print("Testing Google Apps Script Connection")
            print("=" * 50)
            
            url = settings.GOOGLE_APPS_SCRIPT_URL
            print(f"\nURL: {url}")
            
            if "YOUR_SCRIPT_ID" in url:
                print("\n✗ Error: Google Apps Script URL not configured")
                print("  Update GOOGLE_APPS_SCRIPT_URL in .env file")
                return
            
            print("\nSending test request...")
            
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(
                        url + "?action=get",
                        json={"record_id": "test"},
                        headers={"X-API-Key": settings.GOOGLE_APPS_SCRIPT_API_KEY}
                    )
                    
                    print(f"\nStatus Code: {response.status_code}")
                    print(f"Response: {response.text[:200]}")
                    
                    if response.status_code == 200:
                        print("\n✓ Connection successful!")
                    else:
                        print("\n⚠ Received response but may have errors")
                        
            except httpx.TimeoutException:
                print("\n✗ Connection timeout")
                print("  Check if URL is correct and accessible")
            except Exception as e:
                print(f"\n✗ Connection failed: {str(e)}")
        
        asyncio.run(test_connection())
        
    except ImportError:
        print("\n✗ Error: httpx not installed")
        print("  Run: pip install httpx")
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")


def main():
    """Main function"""
    while True:
        display_menu()
        
        try:
            choice = input("\nEnter your choice (1-4): ").strip()
            
            if choice == "1":
                print("\n" + "=" * 50)
                print("Generate API Key")
                print("=" * 50)
                
                try:
                    length = input("\nKey length (default 32): ").strip()
                    length = int(length) if length else 32
                except ValueError:
                    length = 32
                
                api_key = generate_api_key(length)
                
                print(f"\nGenerated API Key:")
                print(f"\n{api_key}")
                print(f"\nLength: {len(api_key)} characters")
                print("\nIMPORTANT:")
                print("1. Copy this key")
                print("2. Add to backend/.env as GOOGLE_APPS_SCRIPT_API_KEY")
                print("3. Add to Code.gs as API_KEY in CONFIG")
                print("\n" + "=" * 50)
                
            elif choice == "2":
                check_configuration()
                
            elif choice == "3":
                test_google_connection()
                
            elif choice == "4":
                print("\nExiting... Goodbye!")
                sys.exit(0)
                
            else:
                print("\n✗ Invalid choice. Please enter 1-4.")
                
            input("\nPress Enter to continue...")
            
        except KeyboardInterrupt:
            print("\n\nExiting... Goodbye!")
            sys.exit(0)
        except Exception as e:
            print(f"\n✗ Error: {str(e)}")
            input("\nPress Enter to continue...")


if __name__ == "__main__":
    main()
