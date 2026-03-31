
import re



def distill_system_output(text):
    # 1. Strip ANSI/VT100 noise first
    text = re.sub(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])', '', text)
    
    # 2. Check if it's a long list (like your dpkg output)
    lines = text.splitlines()
    if len(lines) > 8:
        # Check if the last line contains a prompt
        has_prompt = "demo@" in lines[-1] or "root@" in lines[-1]
        
        # Keep the first 3 lines (to show what started) 
        # and the last 3 lines (to show if it finished)
        new_content = lines[:3] + ["... [LIST TRUNCATED] ..."] + lines[-3:]
        return "\n".join(new_content)
    
    return text

print(distill_system_output("""<system_output timestamp="67.122999"> all Help i18n of RFC822 compliant config files

ii iotop 0.6-2 i386 simple top-like I/O monitor

ii iproute2 4.9.0-1+deb9u1 i386 networking and traffic control tools

ii iptables 1.6.0+snapshot20161117-6 i386 administration tools for packet filtering and NAT

ii iputils-ping 3:20161105-1 i386 Tools to test the reachability of network hosts

ii isc-dhcp-client 4.3.5-3+deb9u1 i386 DHCP client for automatically obtaining an IP address

ii isc-dhcp-common 4.3.5-3+deb9u1 i386 common manpages relevant to all of the isc-dhcp packages

ii kbd 2.0.3-2+b1 i386 Linux console font and keytable utilities

ii keyutils 1.5.9-9 i386 Linux Key Management Utilities

ii klibc-utils 2.0.4-9 i386 small utilities built with klibc for early boot

ii kmod 23-2 i386 tools for managing Linux kernel modules

ii less 481-2.1 i386 pager program similar to more

ii libacl1:i386 2.2.52-3+b1 i386 Access control list shared library

ii libapparmor1:i386 2.11.0-3+deb9u2 i386 changehat AppArmor library

ii libapr1:i386 1.5.2-5 i386 Apache Portable R</system_output>

<system_output timestamp="67.124082">"""))